## Why

`Elm327TcpRepository` (`apps/core-api/src/infrastructure/elm327/elm327Adapter.ts`, 303 líneas) es una clase god-object que mezcla 7 responsabilidades en un solo fichero:

1. **Errores** (~20 líneas): `Elm327ConnectionError`, `Elm327NoDataError`, `Elm327ParseError`
2. **Configuración** (~10 líneas): `Elm327TcpConfig` + `DEFAULT_TIMEOUT_MS`
3. **Catálogo de fórmulas** (~60 líneas): 31 fórmulas SAE Mode 01 + VAG Mode 22 + `applyPidFormula()`
4. **Utilidades hex** (~20 líneas): `parseHexBytes()`, `bigEndian()`, `formatCommand()`
5. **Transporte TCP** (~30 líneas): `sendCommand()` con socket efímero
6. **Protocolo ELM327** (~60 líneas): `stripEcho()` + 4 parseadores de respuesta
7. **Implementación `ObdRepository`** (~80 líneas): los 8 métodos públicos del puerto

**Dependencia incómoda**: importa `STANDARD_MODE_01_PIDS` de `infrastructure/persistence/sqlite/seed-pids.ts` **solo por las fórmulas** (16 entradas). Esto acopla el módulo de protocolo ELM327 (conocimiento del estándar SAE J1979) con el seed de persistencia SQLite (cuyo `PidDefinition` incluye campos de persistencia irrelevantes para el adaptador: `id`, `source`, `confidence`, `minValue`...). Un cambio en el seed (p. ej. reordenar PIDs) puede romper el diagnóstico sin razón de protocolo.

El patrón ya consolidado en `elm327/` (pidParser, vinDecoder, isotp/) es: módulos pequeños con una única responsabilidad y funciones puras. `elm327Adapter.ts` es la única excepción que queda.

## What Changes

- **`errors.ts`** — los 3 errores ELM327 se mueven del adapter a su propio módulo (mismo contenido, TSDoc).
- **`hexUtils.ts`** — `parseHexBytes()` y `bigEndian()` como utilidades puras de bytes.
- **`protocol.ts`** — gramática del wire protocol ELM327: `formatCommand()`, `stripEcho()`, `parseModeResponse()`, `parseMode22Response()`, `parseVinResponse()`, `parseDtcResponse()` **y** `parseSupportedPidBitmask()` (extraído del cuerpo de `getSupportedPids()`). Lanzan los errores de `errors.ts`.
- **`pidFormulas.ts`** — catálogo de fórmulas autocontenido: `STANDARD_MODE_01_FORMULAS` (16 SAE, claves `"01 0C"`), `VAG_MODE_22_FORMULAS` (16 DIDs, claves `"22 1130"`) y `createPidFormulaCatalog()` con `get(mode, pid)` + `apply(mode, pid, bytes)` (usa `evaluatePid` de `pidParser.ts` y fallback `bigEndian`). **Sin import de `seed-pids.ts`**.
- **`tcpTransport.ts`** — `Elm327TcpConfig` + `DEFAULT_TIMEOUT_MS` + `createElm327TcpClient(config)` con `sendCommand(cmd)` (socket efímero, resuelve en el prompt `>`, timeout 3s).
- **`elm327Adapter.ts`** — queda como **composition root** (~120 líneas): constructor cablea `createElm327TcpClient` + `createPidFormulaCatalog`; los 8 métodos del puerto orquestan send → parse → fórmula. **Re-exporta** los errores y `Elm327TcpConfig` para no romper imports existentes.
- **Test de paridad** — `pidFormulas.test.ts` importa `STANDARD_MODE_01_PIDS` y verifica que las 16 fórmulas del catálogo ELM327 coinciden (formula + dataBytes), de modo que la duplicación intencional no pueda derivar en silencio.

**Resolución de la dependencia con `seed-pids.ts`**: el catálogo de fórmulas pasa a ser conocimiento de protocolo del módulo `elm327/` (autocontenido). `seed-pids.ts` no se toca. El test de paridad es el guardrail anti-drift.

## Capabilities

### Modified Capabilities
- `elm327-tcp-repository`: El adaptador se descompone en 6 módulos SRP dentro de `infrastructure/elm327/`. `Elm327TcpRepository` conserva los 8 métodos públicos de `ObdRepository` con firma idéntica y se convierte en composition root. El catálogo de fórmulas deja de depender de `persistence/sqlite/seed-pids.ts` (paridad garantizada por test). Comportamiento externo (commands, parsing, errores, valores físicos) sin cambios.

## Impact

- **Nuevo**: `apps/core-api/src/infrastructure/elm327/errors.ts`
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/hexUtils.ts`
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/protocol.ts`
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/pidFormulas.ts`
- **Nuevo**: `apps/core-api/src/infrastructure/elm327/tcpTransport.ts`
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/elm327/errors.test.ts`
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/elm327/hexUtils.test.ts`
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/elm327/protocol.test.ts`
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/elm327/pidFormulas.test.ts` (incluye test de paridad vs seed-pids)
- **Nuevo**: `apps/core-api/tests/unit/infrastructure/elm327/tcpTransport.test.ts`
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (composición + re-exports, de ~303 a ~120 líneas)
- **Modificado**: `apps/core-api/tests/unit/infrastructure/elm327/elm327Adapter.test.ts` (sin cambios de imports gracias a los re-exports; verificación de suite)
- **Sin cambios**: `ObdRepository` port, `composition.ts`, `ProcessVehicleDiagnosisUseCase`, `createMcpServer`, `DiagnosisController`, `seed-pids.ts`, `pidParser.ts`, `vinDecoder.ts`, `isotp/`
