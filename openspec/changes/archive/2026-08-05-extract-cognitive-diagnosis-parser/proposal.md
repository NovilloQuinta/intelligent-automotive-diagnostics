## Why

`executeCognitiveDiagnosis` mezcla prompt engineering con el parseo del contrato externo del LLM (`JSON_BLOCK_REGEX`, `cognitiveDiagnosisJsonSchema`, `parseCognitiveDiagnosis`, `fallbackDiagnosis`). La salida del LLM es un contrato externo — esa logica es una capa anti-corrupcion, no logica de use case.

## What Changes

- **Parser anti-corrupcion del LLM**: nuevo `application/services/cognitiveDiagnosisParser.ts` (regex, schema Zod, fallback, tipo `ParsedCognitiveDiagnosis`); `executeCognitiveDiagnosis` delega en el.
- El use case queda libre de regex/schema/fallback propios.

## Capabilities

### Modified Capabilities
- `execute-cognitive-diagnosis`: El parseo del bloque `---JSON---` del LLM se extrae al modulo anti-corrupcion `application/services/cognitiveDiagnosisParser.ts`; el use case delega y queda libre de regex/schema/fallback propios.

## Impact

- Nuevo: `apps/core-api/src/application/services/cognitiveDiagnosisParser.ts`
- Modificado: `apps/core-api/src/application/use-cases/executeCognitiveDiagnosis.ts` (delega en parser)
- Nuevo: `tests/unit/application/services/cognitiveDiagnosisParser.test.ts`
