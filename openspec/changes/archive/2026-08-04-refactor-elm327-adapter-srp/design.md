## Context

Rama `refactor/elm327-adapter-srp`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Express 5, Clean Architecture, Vitest. Suite actual: 404 tests verdes (29 ficheros).

Estado del módulo `infrastructure/elm327/`: `elm327Adapter.ts` (303 líneas, god-object de 7 responsabilidades) + módulos ya extraídos con el patrón objetivo (`pidParser.ts` — evaluador de fórmulas, `vinDecoder.ts` — decodificador VIN, `isotp/` — segmentador/reensamblador). El único import "sucio" del adapter es `STANDARD_MODE_01_PIDS` desde `infrastructure/persistence/sqlite/seed-pids.ts`, usado exclusivamente para construir el `Map` de fórmulas SAE en el constructor.

Consumidores del adapter: `composition.ts` (importa `Elm327TcpRepository` de `@/infrastructure/elm327/elm327Adapter.js` y lo construye con `{ host, port }`) y `tests/unit/infrastructure/elm327/elm327Adapter.test.ts` (importa la clase + los 3 errores). Los use cases, MCP y controller consumen únicamente el puerto `ObdRepository` (sin imports directos del adapter).

Verificación previa: ningún método privado del adapter (stripEcho, parseadores, formatCommand, bigEndian, applyPidFormula) se usa fuera de la clase. El mock TCP (`vi.mock('node:net')` + harness `respond()`/`expectSent()`/`lastSocket()`) es file-scoped: `vi.mock` se hoistea por fichero de test.

## Goals / Non-Goals

**Goals:**
- Descomponer `elm327Adapter.ts` en 6 módulos SRP dentro de `infrastructure/elm327/`, con el adapter como composition root.
- Eliminar el import de `seed-pids.ts` del módulo ELM327 (catálogo de fórmulas autocontenido) sin tocar `seed-pids.ts`.
- Los 8 métodos públicos del puerto `ObdRepository` mantienen firma y comportamiento idénticos (values, commands, errores).
- Consumidores sin cambios: `composition.ts`, `ProcessVehicleDiagnosisUseCase`, `createMcpServer`, `DiagnosisController`, y el import de errores del test existente (vía re-exports).
- TDD estricto RED → GREEN → REFACTOR por módulo; Zero Broken Windows (build + lint + test verdes en cada paso).
- Test de paridad entre el catálogo ELM327 y `STANDARD_MODE_01_PIDS` para prevenir drift.

**Non-Goals:**
- No cambia el comportamiento del protocolo ni los comandos enviados al emulador.
- No toca `seed-pids.ts` ni el schema de Drizzle.
- No introduce nuevos puertos en `application/` (el refactor es infraestructura pura).
- No toca `pidParser.ts`, `vinDecoder.ts` ni `isotp/`.
- No implementa connection pooling, reconexión ni AT commands explícitos (los Non-Goals del cambio original se mantienen).
- No corrige la desviación histórica de paths en specs viejas salvo la del capability `elm327-tcp-repository` (que este cambio sí actualiza).

## Decisions

### 1. Catálogo de fórmulas autocontenido en `elm327/` + test de paridad

**Elegido**: `pidFormulas.ts` define `STANDARD_MODE_01_FORMULAS` (16 fórmulas SAE como registros planos `{ formula, dataBytes }`, claves `"01 0C"`) y `VAG_MODE_22_FORMULAS` (16 DIDs, claves `"22 1130"`). `seed-pids.ts` no se toca. Un test de paridad en `pidFormulas.test.ts` importa `STANDARD_MODE_01_PIDS` y verifica que las 16 claves coinciden en `formula` + `dataBytes`, de forma que la duplicación intencional no pueda derivar en silencio.

**Rechazado (a)**: Mantener el import de `seed-pids.ts` (relocarlo a `pidFormulas.ts`). No resuelve la dependencia incómoda — la traslada. El módulo de protocolo seguiría acoplado al seed de persistencia.

**Rechazado (b)**: Derivar `seed-pids.ts` desde el catálogo ELM327. `PidDefinition` lleva campos de persistencia (`id`, `confidence`, `source`, `minValue`, `maxValue`, `unit`, `name`) que el catálogo de protocolo no posee; la dirección de dependencia correcta es persistencia → protocolo, no al revés. Riesgo alto de alterar el seeding para un beneficio marginal.

**Nota**: Esto **revierte la decisión 3** del cambio `add-elm327-tcp-repository` ("Fórmulas desde STANDARD_MODE_01_PIDS... Rechazado: Hardcodear fórmulas en el adapter. Duplicaría la fuente de verdad"). La reversión se justifica: (1) el catálogo de fórmulas es conocimiento del estándar SAE J1979, propiedad del módulo de protocolo, no de la persistencia; (2) el test de paridad convierte la duplicación en una invariante verificable; (3) se elimina el acoplamiento infraestructura→infraestructura que hace de `seed-pids.ts` un punto único de fallo para el diagnóstico.

### 2. `elm327Adapter.ts` como composition root con re-exports de compatibilidad

**Elegido**: El adapter conserva `Elm327TcpRepository implements ObdRepository` (patrón existente: `ObdSimulatorRepository` también es clase). El constructor cablea `createElm327TcpClient(config)` y `createPidFormulaCatalog()`; los 8 métodos orquestan `client.sendCommand` → parsers de `protocol.ts` → `catalog.apply`. Re-exporta `Elm327ConnectionError`, `Elm327NoDataError`, `Elm327ParseError` y `Elm327TcpConfig` desde sus módulos nuevos.

**Razón**: `composition.ts` y `elm327Adapter.test.ts` no cambian ni una línea (Zero Broken Windows literal). Los re-exports son un facade de compatibilidad, no una responsabilidad: la propiedad de los errores sigue en `errors.ts`.

### 3. `tcpTransport.ts` con factory function, no clase

**Elegido**: `createElm327TcpClient(config): { sendCommand(cmd): Promise<string> }` — factory con closure sobre host/port/timeout. Regla del proyecto: "Factory functions, no clases". `Elm327TcpConfig` y `DEFAULT_TIMEOUT_MS = 3000` viven aquí.

**Rechazado**: Clase `Elm327TcpClient`. Añade mutabilidad (host/port/timeout como campos) sin beneficio; el cierre es suficiente para un cliente sin estado.

### 4. `protocol.ts` agrupa la gramática completa del wire protocol

**Elegido**: `formatCommand(mode, pid)` + `stripEcho(raw)` + `parseModeResponse` + `parseMode22Response` + `parseVinResponse` + `parseDtcResponse` + `parseSupportedPidBitmask(bytes)` en un solo módulo. Todas son funciones puras que interpretan o construyen el dialecto ELM327 (sin headers, prompt `>`). `parseSupportedPidBitmask` se extrae del cuerpo de `getSupportedPids()` (13 líneas de lógica Mode 01 PID 00/20/40/60) porque es interpretación de respuesta, no orquestación.

**Rechazado**: Separar `commands.ts` (formatCommand solo) y `parsers.ts`. Dos módulos de ~15 y ~100 líneas con una sola función cada uno fragmentaría la cohesión: formatCommand y stripEcho son las dos caras de la misma gramática (construcción vs. limpieza del wire format).

### 5. Semántica de claves y normalización idénticas al código actual

**Elegido**: `catalog.get(mode, pid)` normaliza como el código actual: `` `${mode} ${pid.toUpperCase()}` `` (sin strip de whitespace). Claves SAE `"01 0C"` (formato `PidCode.key`), claves VAG `"22 1130"`. `apply` replica el fallback actual: `!entry || entry.formula === ''` → `bigEndian(bytes)`; si no, `evaluatePid(formula, bytes.slice(0, dataBytes))`.

**Razón**: comportamiento byte a byte idéntico; los 16 tests existentes del adapter validan la equivalencia sin necesidad de golden tests adicionales.

### 6. Harness de mock TCP duplicado por fichero de test

**Elegido**: `tcpTransport.test.ts` lleva su propio `vi.mock('node:net')` + helpers (`lastSocket()`, `respond()`, `expectSent()`), copia del existente en `elm327Adapter.test.ts`. El adapter test se queda como está.

**Rechazado**: Extraer un helper compartido `mockElm327Socket.ts`. `vi.mock` se hoistea por fichero de test; un helper que llame a `vi.mock` no hoistea con la semántica correcta y oscurece el test. La duplicación (~30 líneas) es el coste aceptado por mocks deterministas y file-scoped.

## Data Model

### Estructura de módulos (`src/infrastructure/elm327/`)

```
elm327/
├── elm327Adapter.ts   ← composition root: Elm327TcpRepository (class, ~120 líneas)
│                        constructor: client = createElm327TcpClient(config)
│                                      catalog = createPidFormulaCatalog()
│                        8 métodos del puerto orquestan client → protocol → catalog
│                        re-exports: Elm327ConnectionError, Elm327NoDataError,
│                                     Elm327ParseError, Elm327TcpConfig
├── errors.ts          ← Elm327ConnectionError, Elm327NoDataError, Elm327ParseError
├── hexUtils.ts        ← parseHexBytes(hex): number[]; bigEndian(bytes): number
├── protocol.ts        ← formatCommand(mode,pid); stripEcho(raw);
│                        parseModeResponse(raw); parseMode22Response(raw,didLen);
│                        parseVinResponse(raw); parseDtcResponse(raw);
│                        parseSupportedPidBitmask(bytes): string[]
│                        (usa hexUtils; lanza errores de errors.ts)
├── pidFormulas.ts     ← STANDARD_MODE_01_FORMULAS (16, claves "01 0C")
│                        VAG_MODE_22_FORMULAS (16, claves "22 1130")
│                        createPidFormulaCatalog(): { get(mode,pid); apply(mode,pid,bytes) }
│                        (usa evaluatePid de pidParser.ts; fallback bigEndian de hexUtils.ts)
├── pidParser.ts       ← (sin cambios) evaluatePid
├── tcpTransport.ts    ← Elm327TcpConfig; DEFAULT_TIMEOUT_MS = 3000;
│                        createElm327TcpClient(config): { sendCommand(cmd): Promise<string> }
├── vinDecoder.ts      ← (sin cambios) decodeVin
└── isotp/             ← (sin cambios)
```

### Catálogo de fórmulas

```typescript
export interface PidFormula {
  readonly formula: string
  readonly dataBytes: number
}

// Claves: `${mode} ${pid}` — ej. "01 0C", "22 1130" (formato PidCode.key)
export const STANDARD_MODE_01_FORMULAS: Record<string, PidFormula> = {
  '01 04': { formula: 'A*100/255', dataBytes: 1 },   // Calculated Engine Load
  '01 05': { formula: 'A-40', dataBytes: 1 },        // Coolant Temperature
  // ... 16 entradas, mismas fórmulas que STANDARD_MODE_01_PIDS
}

export const VAG_MODE_22_FORMULAS: Record<string, PidFormula> = {
  '22 1130': { formula: '(A*256+B)/4', dataBytes: 2 }, // Engine Speed
  // ... 16 entradas, movidas verbatim del adapter
}

export function createPidFormulaCatalog(): {
  get(mode: string, pid: string): PidFormula | undefined
  apply(mode: string, pid: string, bytes: number[]): number
}
```

`apply` replica el comportamiento actual de `applyPidFormula`:
`!entry || entry.formula === ''` → `bigEndian(bytes)`, si no → `evaluatePid(formula, bytes.slice(0, dataBytes))`.

### Transporte

```typescript
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  readonly timeout?: number  // Timeout por comando en ms (default 3000)
}

export function createElm327TcpClient(config: Elm327TcpConfig): {
  sendCommand(cmd: string): Promise<string>  // socket efímero; resuelve en primer '>'
}
```

Comportamiento preservado verbatim de `sendCommand()` actual: `createConnection` → `write(cmd\r\n)` → acumular data → resolver en `>` (destroy) → timeout `Elm327ConnectionError` → socket error `Elm327ConnectionError` (con host:port y code/message).

### Adapter resultante

```typescript
export class Elm327TcpRepository implements ObdRepository {
  private readonly client: { sendCommand(cmd: string): Promise<string> }
  private readonly catalog: PidFormulaCatalog

  constructor(config: Elm327TcpConfig)
  // 8 métodos públicos con firma idéntica al puerto:
  readPid(mode, pid)       → client.sendCommand(formatCommand(mode,pid))
                             → parseModeResponse | parseMode22Response(raw, catalog.get(mode,pid)?.dataBytes ?? 0)
                             → catalog.apply(mode, pid, bytes)
  getSupportedPids()       → sendCommand('01 00') → parseModeResponse → parseSupportedPidBitmask
  getFreezeFrame(dtc?)     → sendCommand('02 0C') → NO DATA → null; parseModeResponse → FreezeFrame
  readDtcCodes()           → sendCommand('03') → parseDtcResponse → DtcCode.decodeFromBytes
  clearDtcCodes()          → sendCommand('04')
  readVin()                → sendCommand('09 02') → parseVinResponse → decodeVin
  getVehicleInfo()         → readVin → Vin → VehicleInfo (fallback FALLBACK_VIN)
  setPower(_on)            → no-op
}
```

`UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'` permanece en el adapter (constante de mapeo a dominio).

## Error Handling

| Error | Propietario | Comportamiento (sin cambios) |
|---|---|---|
| `Elm327ConnectionError` | `errors.ts`, lanzado por `tcpTransport.ts` | timeout o socket error, con host:port y mensaje descriptivo |
| `Elm327NoDataError` | `errors.ts`, lanzado por `protocol.ts` | respuesta `NO DATA` en parseo de PID/VIN |
| `Elm327ParseError` | `errors.ts`, lanzado por `protocol.ts` | respuesta ilegible/malformada (raw en mensaje) |
| `parseDtcResponse` con `NO DATA` | `protocol.ts` | devuelve `[]` (no lanza) — preservado |
| VIN inválido | adapter (`getVehicleInfo`) | catch → `{ make: 'unknown', ..., vin: FALLBACK_VIN }` — preservado |

## Risks / Trade-offs

- [Duplicación de 16 fórmulas SAE entre `pidFormulas.ts` y `seed-pids.ts`] → Mitigado por el test de paridad (falla si cualquier fórmula/dataBytes diverge). Documentado como reversión justificada de la decisión 3 del cambio original.
- [Re-exports en el adapter ocultan el módulo propietario] → Riesgo bajo: `errors.ts` es el único lugar de definición; los re-exports son compatibilidad explícita (comentada con `@deprecated`? No — son la API pública estable del adapter, se documentan en TSDoc del fichero).
- [Extractos mecánicos introducen regresiones sutiles] → Mitigado por los 16 tests existentes del adapter que verifican comportamiento end-to-end (mock TCP) tras cada extracción, + tests unitarios por módulo nuevo.
- [`parseSupportedPidBitmask` extraído] → Riesgo bajo: lógica pura sin estado; cubierta por el test existente `getSupportedPids` y nuevo test unitario en `protocol.test.ts`.
