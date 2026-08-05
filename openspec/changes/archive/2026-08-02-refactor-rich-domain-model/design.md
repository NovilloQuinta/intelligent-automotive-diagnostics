## Context

Rama `refactor/rich-domain-model`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Express 5, Clean Architecture, Vitest, Zod. El proyecto tiene 410 tests verdes (30 ficheros).

Patrón de referencia ya consolidado en el codebase:
- `domain/vin.ts` — clase `Vin`: private constructor, `static create()` que valida y lanza `VinDecodeError`, getters derivados (`wmiRegion`, `manufacturer`, `modelYear`), `toString()`.
- `domain/pidCode.ts` — clase `PidCode`: private constructor, `static create()` que valida y lanza `PidCodeError`, getter derivado `key`.

Estado actual de `domain/diagnosisResult.ts`: clase híbrida con `computeSeverity()` (correcto) pero `rawData` + `diagnosisText` (presentación) y `create()` que acepta `severity` del caller sin validar (anémico).

`application/use-cases/processVehicleDiagnosis.ts` construye `rawData` (JSON.stringify) y `diagnosisText` (buildDiagnosisText) y los pasa al dominio. `application/use-cases/executeCognitiveDiagnosis.ts` mezcla prompt engineering con `JSON_BLOCK_REGEX`, `cognitiveDiagnosisJsonSchema`, `parseCognitiveDiagnosis` y `fallbackDiagnosis` (parseo de contrato externo del LLM).

Consumidores del contrato HTTP actual de `POST /api/diagnosis` (`{ rawData, parsedValues, dtcCodes, diagnosisText, severity }`): `swagger.ts` (schema), `diagnosis.routes.test.ts` (aserciones `severity`, `parsedValues.rpm`), `server.test.ts` (aserciones `diagnosisText`, `rawData`).

## Goals / Non-Goals

**Goals:**
- `DiagnosisResult` como value object rico: constructor privado, `create()` que deriva severidad, getters derivados, cero datos de presentación.
- `processVehicleDiagnosis` devuelve entidad pura; el texto y el rawData se producen en el mapper de infraestructura.
- Parser del bloque JSON del LLM extraído a módulo anti-corrupción (`application/services/`).
- Contrato HTTP de `POST /api/diagnosis` idéntico (swagger y tests de ruta/server sin cambios).
- TDD estricto RED → GREEN → REFACTOR; suite completa verde al final (410+ tests).
- Actualizar skill `clean-architecture` para permitir comportamiento en dominio (Vin/PidCode ya lo hacen).

**Non-Goals:**
- No cambia el schema de Drizzle ni la persistencia.
- No cambia `Severity` (enum compartido por flujo determinista y cognitivo).
- No cambia el contrato HTTP ni swagger.
- No introduce Zod en `domain/` (las entradas ya son interfaces tipadas; la validación profunda es de otra fase).
- No toca `mcpServer.ts`, `llmClient.port.ts` ni el bucle de tool calling.

## Decisions

### 0. FreezeFrame: value object rico (patrón Vin/PidCode)

**Elegido**: Convertir `FreezeFrame` de interface pura a clase con comportamiento. Estado = `{ dtcCode: string, pidValues: Readonly<Record<string, number>> }` (constructor privado). `static create({ dtcCode, pidValues })` valida invariantes (dtcCode no vacío, pidValues no vacío) y lanza `FreezeFrameError`. Getter `pidKeys` reemplaza `Object.keys(freezeFrame.pidValues)` en el mapper. Método `getPidValue(pid)` con tipo de retorno `number | undefined`.

**Motivo**: `Object.keys(freezeFrame.pidValues)` en el mapper es code smell — el mapper está accediendo a las tripas del objeto. `freezeFrame.pidKeys` encapsula. `FreezeFrameError` da errores de dominio tipados en lugar de fallos silenciosos. El patrón ya existe (Vin/PidCode) — FreezeFrame es el tercer value object rico.

**Rechazado**: mantener interface + `Object.keys()` en mapper. Viola "tell, don't ask".

### 1. DiagnosisResult: estado mínimo + getters derivados (patrón Vin)

**Elegido**: Estado = `{ parsedValues: LiveData, dtcCodes: DtcCode[], freezeFrame: FreezeFrame | null }` (constructor privado). Getter `severity` derivado vía `computeSeverity(this.dtcCodes.length, this.freezeFrame)`; getters `dtcCount` y `hasFreezeFrame` también derivados. `create({ parsedValues, dtcCodes, freezeFrame })` no acepta `severity` del caller.

**Desviación mínima del plan del orquestador**: el plan listaba `severity` como campo del constructor. Se almacena `freezeFrame` en su lugar y `severity` pasa a ser getter derivado. Motivos:
1. El mapper necesita `freezeFrame` para reconstruir `diagnosisText` (incluye `freezeFrame.dtcCode` y las claves de `pidValues`) — sin almacenarlo, el mapper tendría que releer del repo (I/O extra) o perder información.
2. Fuente de verdad única: la severidad nunca puede divergir del estado (el defecto anémico actual es exactamente que el caller la inyecta).
3. Coincide con el patrón Vin (`wmiRegion`/`modelYear` son getters derivados, no campos).

**Rechazado**: almacenar `severity` + flag privado `hasFreezeFrame`. Duplica estado derivado (severity podría divergir del flag) y choca con el nombre del getter (colisión propiedad/getter en TS). `computeSeverity` permanece estático: es la regla pura, testeada de forma independiente y usada por el getter.

### 2. Cero presentación en dominio; mapper en infraestructura

**Elegido**: `rawData` y `diagnosisText` desaparecen del dominio y del use case. Nuevo `infrastructure/http/diagnosisResultMapper.ts` con `toDiagnosisResponse(result: DiagnosisResult)` que produce `{ rawData: JSON.stringify(parsedValues), parsedValues, dtcCodes, diagnosisText: buildDiagnosisText(...), severity }`. `buildDiagnosisText` se mueve del use case al mapper (presentación en el borde HTTP, donde pertenece).

**Rechazado**: mantener `buildDiagnosisText` en application. El texto legible es presentación; la capa application orquesta y devuelve la entidad pura. El mapper en fichero propio (no inline en la ruta) respeta "1 fichero = 1 responsabilidad" y es testeable de forma aislada.

### 3. Parser anti-corrupción en `application/services/`

**Elegido**: Nuevo directorio `application/services/cognitiveDiagnosisParser.ts` que exporta `parseCognitiveDiagnosis(text): ParsedCognitiveDiagnosis`, `cognitiveDiagnosisJsonSchema` y el tipo `ParsedCognitiveDiagnosis`. Internos: `JSON_BLOCK_REGEX` (tolerante a `---JSON\n` de DeepSeek), `fallbackDiagnosis()` (Medium / 0.5 / []), zod. `executeCognitiveDiagnosis` delega y queda con prompt + `buildUserMessage` + orquestación.

**Motivo**: la salida del LLM es un contrato externo → capa anti-corrupción. El parser es puro (regex + Zod + fallback, sin I/O), no importa infraestructura, y su semántica de fallback queda testeable directamente. Semánticas de fallback sin cambios respecto al comportamiento actual.

**Rechazado**: parser en `domain/` (el formato del LLM no es regla de negocio) y parser en `infrastructure/` (no es un adapter concreto; la normalización de contrato externo es application).

### 4. Contrato HTTP y swagger sin cambios

**Elegido**: El mapper reproduce exactamente el shape actual. `swagger.ts`, `diagnosis.routes.test.ts` y `server.test.ts` no se modifican — verifican el contrato intacto tras el refactor. El único cambio en la ruta es `res.status(200).json(toDiagnosisResponse(result))` en el handler determinista.

### 5. Skill clean-architecture: permitir comportamiento en dominio

**Elegido**: Actualizar `.opencode/skills/clean-architecture/SKILL.md` (fuente de verdad): `domain/` permite value objects ricos con comportamiento puro — private constructor, `static create()` con validación y errores tipados, getters derivados (patrón `Vin`/`PidCode`/`DiagnosisResult`). El wrapper `.claude/skills/clean-architecture/SKILL.md` no duplica contenido (ordena leer la fuente) → verificar solo, sin editar.

## Data Model

### FreezeFrame (nuevo, value object rico)

```typescript
export class FreezeFrameError extends Error { ... }

export class FreezeFrame {
  private constructor(
    readonly dtcCode: string,
    readonly pidValues: Readonly<Record<string, number>>,
  ) {}

  static create(params: {
    dtcCode: string
    pidValues: Record<string, number>
  }): FreezeFrame  // valida invariantes, lanza FreezeFrameError

  get pidKeys(): string[]              // reemplaza Object.keys(freezeFrame.pidValues)
  getPidValue(pid: string): number | undefined
}
```

### DiagnosisResult (nuevo, rico)

```typescript
export class DiagnosisResult {
  private constructor(
    readonly parsedValues: LiveData,
    readonly dtcCodes: DtcCode[],
    readonly freezeFrame: FreezeFrame | null,
  ) {}

  static computeSeverity(dtcCount: number, freezeFrame: FreezeFrame | null): Severity
  static create(params: {
    parsedValues: LiveData
    dtcCodes: DtcCode[]
    freezeFrame: FreezeFrame | null
  }): DiagnosisResult

  get severity(): Severity        // computeSeverity(dtcCodes.length, freezeFrame)
  get dtcCount(): number
  get hasFreezeFrame(): boolean
}
```

`Severity` (enum) se mantiene en el mismo fichero. `computeSeverity` conserva exactamente su lógica actual (Low si 0 DTCs; Critical si freeze frame con DTCs; High en el resto).

### cognitiveDiagnosisParser (nuevo, anti-corrupción)

```typescript
export const cognitiveDiagnosisJsonSchema = z.object({
  severity: z.nativeEnum(Severity),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
})
export type ParsedCognitiveDiagnosis = z.infer<typeof cognitiveDiagnosisJsonSchema>
export function parseCognitiveDiagnosis(text: string): ParsedCognitiveDiagnosis
// internos: JSON_BLOCK_REGEX, fallbackDiagnosis()
```

### Mapper HTTP (nuevo)

```typescript
export interface DiagnosisResponse {
  rawData: string          // JSON.stringify(parsedValues)
  parsedValues: LiveData
  dtcCodes: DtcCode[]
  diagnosisText: string    // buildDiagnosisText(dtcCodes, severity, freezeFrame)
  severity: Severity
}
export function toDiagnosisResponse(result: DiagnosisResult): DiagnosisResponse
```

## Flujo de ejecución (tras el refactor)

```
POST /api/diagnosis { scenarioId }
  → resolveRepository(scenarioId)          // simulador o TCP (sin cambios)
  → processVehicleDiagnosis(repo)          // entidad pura: parsedValues + dtcCodes + freezeFrame
  → DiagnosisResult.create(...)            // deriva severity (getter) — sin rawData/diagnosisText
  → toDiagnosisResponse(result)            // mapper: rawData + diagnosisText (presentación)
  → 200 { rawData, parsedValues, dtcCodes, diagnosisText, severity }   // contrato idéntico

POST /api/mcp/cognitive-diagnosis
  → executeCognitiveDiagnosis({ ... })     // orquestación (sin cambios)
  → parseCognitiveDiagnosis(text)          // delegado a application/services/cognitiveDiagnosisParser.ts
  → 200 { diagnosis, severity, confidence, recommendations, toolCalls }   // sin cambios
```

## Test plan

| Fase | Fichero | Casos clave |
|---|---|---|
| RED | `tests/unit/domain/diagnosisResult.test.ts` (reescrito) | computeSeverity (4 casos existentes); create deriva severity (High/Critical/Low); getters dtcCount/hasFreezeFrame; create rechaza severity/rawData/diagnosisText (TS); sin campos rawData/diagnosisText |
| RED | `tests/unit/application/services/cognitiveDiagnosisParser.test.ts` (nuevo) | bloque inline válido; variante `---JSON\n` (DeepSeek); sin bloque → fallback; JSON mal formado → fallback; confidence > 1 → fallback; severity inválido → fallback |
| RED | `tests/unit/infrastructure/http/diagnosisResultMapper.test.ts` (nuevo) | shape completo; rawData = JSON.stringify(parsedValues); diagnosisText con DTCs, con freeze frame (dtcCode + claves), sin DTCs; severity como string |
| Verdes sin tocar | `diagnosis.routes.test.ts`, `server.test.ts`, `swagger.ts`, `executeCognitiveDiagnosis.test.ts` | contrato HTTP idéntico; fallback cognitivo vía delegación |
