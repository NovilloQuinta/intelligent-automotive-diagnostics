## Why

El dominio es anémico. El proyecto ya tiene el patrón de value object rico correcto — `Vin` y `PidCode` (private constructor, `static create()` con validación, getters derivados, error tipado) — pero `DiagnosisResult` es una clase híbrida que mezcla responsabilidades:

- Tiene la regla de negocio pura (`computeSeverity()` estático) ✅
- Pero conserva `rawData: string` (JSON.stringify → serialización) ❌
- Y `diagnosisText: string` (texto de presentación) ❌
- Y `create()` acepta `severity`/`diagnosisText`/`rawData` del caller → anémico, no valida, permite estados inconsistentes (severity que no corresponde a los DTCs)

Además, `executeCognitiveDiagnosis` mezcla prompt engineering con el parseo del contrato externo del LLM (`JSON_BLOCK_REGEX`, `cognitiveDiagnosisJsonSchema`, `parseCognitiveDiagnosis`, `fallbackDiagnosis`). La salida del LLM es un contrato externo — esa lógica es una capa anti-corrupción, no lógica de use case.

Refactorizar el dominio a rich domain model elimina estados inconsistentes (la severidad se deriva, no se inyecta), saca la presentación del dominio y separa el contrato externo del LLM del flujo de aplicación.

## What Changes

- **`DiagnosisResult` como value object rico** (patrón `Vin`/`PidCode`): constructor privado con `{ parsedValues, dtcCodes, freezeFrame }`, `static create()` que calcula severidad vía `computeSeverity`, getters derivados `severity`, `dtcCount`, `hasFreezeFrame`. Se eliminan `rawData` y `diagnosisText` del dominio.
- **`processVehicleDiagnosis` devuelve entidad pura**: elimina `buildDiagnosisText()` y la construcción de `rawData`/`diagnosisText`; delega el cálculo de severidad en `DiagnosisResult.create()`.
- **Mapper HTTP en infraestructura**: nuevo `infrastructure/http/diagnosisResultMapper.ts` produce `rawData` + `diagnosisText` para la respuesta de `POST /api/diagnosis`. El contrato HTTP no cambia → `swagger.ts` y los tests de rutas/server no se tocan.
- **Parser anti-corrupción del LLM**: nuevo `application/services/cognitiveDiagnosisParser.ts` (regex, schema Zod, fallback, tipo `ParsedCognitiveDiagnosis`); `executeCognitiveDiagnosis` delega en él.

## Capabilities

### New Capabilities
- `diagnosis-result`: Entidad rica `DiagnosisResult` (severidad derivada, cero presentación en dominio) + mapper HTTP que produce `rawData`/`diagnosisText` en infraestructura manteniendo el contrato de `POST /api/diagnosis`.

### Modified Capabilities
- `execute-cognitive-diagnosis`: El parseo del bloque `---JSON---` del LLM se extrae al módulo anti-corrupción `application/services/cognitiveDiagnosisParser.ts`; el use case delega y queda libre de regex/schema/fallback propios.

## Impact

- Modificado: `apps/core-api/src/domain/diagnosisResult.ts` (rich entity, sin rawData/diagnosisText)
- Modificado: `apps/core-api/src/application/use-cases/processVehicleDiagnosis.ts` (sin buildDiagnosisText/rawData)
- Modificado: `apps/core-api/src/application/use-cases/executeCognitiveDiagnosis.ts` (delega en parser)
- Nuevo: `apps/core-api/src/application/services/cognitiveDiagnosisParser.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/diagnosisResultMapper.ts`
- Modificado: `apps/core-api/src/infrastructure/http/routes/diagnosis.routes.ts` (usa mapper en POST /diagnosis)
- Sin cambios (contrato idéntico): `apps/core-api/src/infrastructure/http/swagger.ts`
- Tests: modificados `tests/unit/domain/diagnosisResult.test.ts`, `tests/unit/usecases/diagnostics/processVehicleDiagnosis.test.ts`; nuevos `tests/unit/application/services/cognitiveDiagnosisParser.test.ts`, `tests/unit/infrastructure/http/diagnosisResultMapper.test.ts`
- Modificado: `.opencode/skills/clean-architecture/SKILL.md` (permitir comportamiento en dominio, patrón Vin/PidCode/DiagnosisResult)
