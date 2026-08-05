# Tasks — extract-cognitive-diagnosis-parser

## 1. RED — Tests del parser anti-corrupcion

- [x] 1.1 Crear `tests/unit/application/services/cognitiveDiagnosisParser.test.ts`:
  - Bloque inline valido → `{ severity, confidence, recommendations }` correctos
  - Variante `---JSON\n{...}\n---` (DeepSeek) → parsea correctamente
  - Sin bloque → fallback (`Severity.Medium`, `0.5`, `[]`)
  - JSON mal formado → fallback
  - `confidence: 2` (fuera de rango) → fallback
  - `severity` invalido → fallback
  - `cognitiveDiagnosisJsonSchema` exportado y valida el shape esperado

## 2. GREEN — Implementar parser + delegacion en use case cognitivo

- [x] 2.1 Crear `src/application/services/cognitiveDiagnosisParser.ts`:
  - Mover desde `executeCognitiveDiagnosis.ts`: `JSON_BLOCK_REGEX` (privada), `cognitiveDiagnosisJsonSchema` (export), tipo `ParsedCognitiveDiagnosis` (export), `parseCognitiveDiagnosis` (export), `fallbackDiagnosis` (privada)
  - Sin imports de infraestructura; TSDoc en exports
- [x] 2.2 Actualizar `src/application/use-cases/executeCognitiveDiagnosis.ts`:
  - Eliminar regex, schema, fallback y parseo locales
  - Importar `parseCognitiveDiagnosis` del parser
  - Conservar `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT`, `buildUserMessage` y la orquestacion
- [x] 2.3 `pnpm test` — tests cognitivos existentes siguen verdes via delegacion

## 3. VERIFY

- [x] 3.1 `pnpm lint && pnpm test && pnpm build` — todo verde
- [x] 3.2 Confirmar que `cognitiveDiagnosisJsonSchema` sigue exportado (desde el parser) y ningun consumidor quedo huerfano
