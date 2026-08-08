# Tasks — refactor-rich-domain-model

TDD estricto: RED → GREEN → REFACTOR. Patrón de referencia: `domain/vin.ts`, `domain/pidCode.ts`. Rama: `refactor/rich-domain-model`. Baseline: 410 tests verdes (30 ficheros). Cada paso deja la suite compilable y verde salvo el RED inmediato. Total estimado tras cambio: ~440 tests (34 ficheros).

## 0. RED → GREEN — Value Object FreezeFrame (patrón Vin/PidCode)

- [x] 0.1 RED: Crear `tests/unit/domain/freezeFrame.test.ts`:
  - `FreezeFrame.create({ dtcCode: 'P0301', pidValues: { rpm: 800 } })` construye correctamente
  - `create` lanza `FreezeFrameError` si `dtcCode` está vacío
  - `create` lanza `FreezeFrameError` si `pidValues` está vacío
  - `freezeFrame.dtcCode` y `freezeFrame.pidValues` (readonly) coinciden
  - `freezeFrame.pidKeys` devuelve `['rpm', 'coolantTemp', 'speed']` ordenadas
  - `freezeFrame.getPidValue('rpm')` devuelve el valor; pid inexistente devuelve `undefined`
- [x] 0.2 GREEN: Reescribir `src/domain/freezeFrame.ts`:
  - `export class FreezeFrame` con `private constructor(readonly dtcCode: string, readonly pidValues: Readonly<Record<string, number>>)`
  - `static create(params): FreezeFrame` — valida invariantes, lanza `FreezeFrameError`
  - `get pidKeys(): string[]` — reemplaza `Object.keys(freezeFrame.pidValues)`
  - `getPidValue(pid: string): number | undefined`
  - Patrón: private constructor + static create() + error tipado (Vin/PidCode)
- [x] 0.3 UPDATE: Migrar todos los constructores de `FreezeFrame` plain object → `FreezeFrame.create()`:
  - `tests/unit/usecases/diagnostics/processVehicleDiagnosis.test.ts`: `mockFreezeFrame()`
  - `tests/unit/domain/diagnosisResult.test.ts`: `mockFreezeFrame()`
  - `tests/unit/infrastructure/mcp/mcpServer.test.ts`: `sampleFreezeFrame`
  - `tests/unit/infrastructure/obd/simulator.test.ts`: objeto `freeze`
  - `src/infrastructure/obd/simulator.ts`: `getFreezeFrame()` asegura devolver instancia de clase
  - `src/infrastructure/obd/elm327TcpRepository.ts`: respuesta parseada usa `create()`
  - `src/domain/simulationScenario.ts`: mantiene `readonly freezeFrame?: FreezeFrame` (el tipo ahora es la clase)
- [x] 0.4 `pnpm test` — suite verde (mismos tests, FreezeFrame rico)

## 1. RED — Tests de la entidad rica DiagnosisResult

- [x] 1.1 Reescribir `tests/unit/domain/diagnosisResult.test.ts`:
  - Conservar los 4 casos de `computeSeverity` existentes (Low sin DTCs, Critical con DTCs+freeze, High con DTCs sin freeze, Low con freeze pero 0 DTCs)
  - `create({ parsedValues, dtcCodes, freezeFrame })` deriva severity: High (P0301 sin freeze), Critical (con freeze), Low (sin DTCs)
  - Getters derivados: `dtcCount` (número de DTCs), `hasFreezeFrame` (true con freeze, false sin freeze)
  - `expect(result).not.toHaveProperty('rawData')` y `not.toHaveProperty('diagnosisText')`
  - Las llamadas antiguas a `create` con `severity`/`rawData`/`diagnosisText` quedan fuera (falla de compilación en el paso 2)
- [x] 1.2 `pnpm test` — RED esperado: compilación del test falla contra el fichero de dominio actual

## 2. GREEN — Refactorizar domain/diagnosisResult.ts

- [x] 2.1 Reescribir `src/domain/diagnosisResult.ts` (patrón Vin/PidCode):
  - `export class DiagnosisResult` con `private constructor(readonly parsedValues: LiveData, readonly dtcCodes: DtcCode[], readonly freezeFrame: FreezeFrame | null)`
  - `static computeSeverity(dtcCount, freezeFrame): Severity` — lógica actual sin cambios
  - `static create(params: { parsedValues; dtcCodes; freezeFrame }): DiagnosisResult` — construye sin aceptar severity
  - `get severity(): Severity` → `computeSeverity(this.dtcCodes.length, this.freezeFrame)`
  - `get dtcCount(): number` y `get hasFreezeFrame(): boolean`
  - ELIMINAR `rawData` y `diagnosisText`
  - TSDoc en todos los exports públicos (lint exige)
- [x] 2.2 `pnpm test` — test de dominio verde; `processVehicleDiagnosis.ts` y su test quedan en rojo (compilación) → paso 3 los arregla de inmediato

## 3. UPDATE — Use case processVehicleDiagnosis: entidad pura

- [x] 3.1 RED: actualizar `tests/unit/usecases/diagnostics/processVehicleDiagnosis.test.ts`:
  - Eliminar los casos `should generate a human-readable diagnosis text` y `should include raw data representation` (aserciones de `diagnosisText`/`rawData` sobre la entidad)
  - Mantener: parsedValues, dtcCodes, severity (high/critical/low)
- [x] 3.2 GREEN: reescribir `src/application/use-cases/processVehicleDiagnosis.ts`:
  - Eliminar `buildDiagnosisText()` y el `JSON.stringify` (rawData)
  - `return DiagnosisResult.create({ parsedValues, dtcCodes, freezeFrame })` — sin severity en la llamada
  - Verificar TSDoc y que no queden imports sin uso
- [x] 3.3 `pnpm test` — suite verde de nuevo (dominio + use case)

## 4. RED — Tests del parser anti-corrupción

- [x] 4.1 Crear `tests/unit/application/services/cognitiveDiagnosisParser.test.ts`:
  - Bloque inline válido → `{ severity, confidence, recommendations }` correctos
  - Variante `---JSON\n{...}\n---` (DeepSeek) → parsea correctamente
  - Sin bloque → fallback (`Severity.Medium`, `0.5`, `[]`)
  - JSON mal formado → fallback
  - `confidence: 2` (fuera de rango) → fallback
  - `severity` inválido → fallback
  - `cognitiveDiagnosisJsonSchema` exportado y valida el shape esperado
- [x] 4.2 `pnpm test` — RED esperado: módulo no existe

## 5. GREEN — Implementar parser + delegación en use case cognitivo

- [x] 5.1 Crear `src/application/services/cognitiveDiagnosisParser.ts` (nuevo directorio `application/services/`):
  - Mover desde `executeCognitiveDiagnosis.ts`: `JSON_BLOCK_REGEX` (privada), `cognitiveDiagnosisJsonSchema` (export), tipo `ParsedCognitiveDiagnosis` (export), `parseCognitiveDiagnosis` (export), `fallbackDiagnosis` (privada)
  - Sin imports de infraestructura; TSDoc en exports
- [x] 5.2 Actualizar `src/application/use-cases/executeCognitiveDiagnosis.ts`:
  - Eliminar regex, schema, fallback y parseo locales
  - Importar `parseCognitiveDiagnosis` (y re-exportar `cognitiveDiagnosisJsonSchema`/`ParsedCognitiveDiagnosis` solo si algún consumidor lo necesita — actualmente ninguno, verificar con grep)
  - Conservar `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT`, `buildUserMessage` y la orquestación
- [x] 5.3 `pnpm test` — los tests cognitivos existentes (bloque válido, fallback, out-of-range) siguen verdes vía delegación

## 6. RED — Tests del mapper HTTP

- [x] 6.1 Crear `tests/unit/infrastructure/http/diagnosisResultMapper.test.ts`:
  - `toDiagnosisResponse(result)` devuelve el shape completo `{ rawData, parsedValues, dtcCodes, diagnosisText, severity }`
  - `rawData` === `JSON.stringify(parsedValues)`
  - `diagnosisText` `[HIGH] P0301` con DTCs sin freeze
  - `diagnosisText` incluye freeze frame (DTC + `pidKeys`) cuando existe
  - `diagnosisText` `[LOW] No fault codes detected` sin DTCs
  - `severity` serializado como string del enum
- [x] 6.2 `pnpm test` — RED esperado: módulo no existe

## 7. GREEN — Implementar mapper + wiring en la ruta

- [x] 7.1 Crear `src/infrastructure/http/diagnosisResultMapper.ts`:
  - `export interface DiagnosisResponse { rawData; parsedValues; dtcCodes; diagnosisText; severity }`
  - `export function toDiagnosisResponse(result: DiagnosisResult): DiagnosisResponse`
  - Mover `buildDiagnosisText(dtcCodes, severity, freezeFrame)` aquí (presentación); mantener la semántica actual (descripción DTCs, `[SEVERIDAD]`, freeze frame)
- [x] 7.2 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`:
  - En `createDiagnosisHandler`: `res.status(200).json(toDiagnosisResponse(result))`
- [x] 7.3 `pnpm test` — `diagnosis.routes.test.ts` y `server.test.ts` verdes SIN tocarlos (contrato idéntico). NO tocar `swagger.ts`

## 8. VERIFY — Suite completa

- [x] 8.1 `pnpm lint && pnpm format && pnpm test && pnpm build` — todo verde (410+ tests)
- [x] 8.2 Checklist clean-architecture: `grep -r "from '@/infrastructure" src/application/` → 0 matches; `grep -r "from '@/application" src/domain/` → 0 matches
- [x] 8.3 Confirmar que `cognitiveDiagnosisJsonSchema` sigue exportado (desde el parser) y que ningún consumidor quedó huérfano

## 9. REFACTOR — Skill clean-architecture

- [x] 9.1 Actualizar `.opencode/skills/clean-architecture/SKILL.md` (fuente de verdad):
  - En `domain/` Allowed contents: sustituir "Value objects (plain data structures, no behavior)" por value objects ricos con comportamiento puro — private constructor, `static create()` con validación y error tipado, getters derivados (patrón `Vin`/`PidCode`/`DiagnosisResult`)
  - Añadir los 3 ejemplos del proyecto en la sección Examples
- [x] 9.2 Verificar `.claude/skills/clean-architecture/SKILL.md`: es wrapper fino que ordena leer la fuente → confirmar que no duplica la lista de contenidos; si duplica, actualizar también (regla del puente)

## 10. CIERRE

- [x] 10.1 Actualizar `SESION ACTUAL` en `AGENTS.md` (refactor rich domain model: DiagnosisResult rico, parser anti-corrupción, mapper HTTP)
- [ ] 10.2 Preguntar al usuario antes de commitear/pushear (regla de sesión 7)
