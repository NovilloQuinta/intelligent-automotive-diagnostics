# Deuda conocida

> Extraido de `AGENTS.md` para no cargarlo en el contexto de cada agente.
> Cifras medidas sobre `develop`. Si corriges algo, re-mide antes de editar aqui.

## Coverage thresholds

`pnpm test:coverage` falla por tres ficheros bajo umbral (medido, no estimado):

| Fichero | Metrica | Actual | Umbral |
|---|---|---|---|
| `src/application/knowledge/diagnosisKnowledgeMapper.ts` | branches | 57.14% | 60% |
| `src/application/shared/withTimeout.ts` | functions | 50% | 90% |
| `src/infrastructure/llm/sdkErrorUtils.ts` | lines / statements | 73.33% | 80% |

Global: statements 97.01%, branches 88.49%, functions 97.77%.

## Funciones que superan las 40 lineas

Las marca ESLint (`max-lines-per-function`, warn, solo `src/`). Ver
"Excepciones al limite de 40 lineas" en `AGENTS.md` para cuando una es legitima.
Las peores:

| Funcion | Lineas |
|---|---|
| `createReliableTransport` | 182 |
| `evaluatePostfix` / `tokenize` (math-parsers) | 57 |
| `createAuthService` | 54 |
| `buildApp` / `createAuthStack` / `upsertEcuDefinition` | 49-50 |
| `createDiagnosisService` | 47 |
| `createMcpServer` | 46 |

## God files (coste de contexto)

Modulos que, junto a su test, superan los 15k tokens por lectura.

| Modulo | Lineas src | Estado |
|---|---|---|
| `infrastructure/services/diagnosisService.ts` | 967 | pendiente — el mas caro del repo |
| `infrastructure/http/swagger.ts` | 1319 | deberia generarse, no escribirse |
| `apps/ui/src/lib/api.ts` | 658 (test 1862) | pendiente |
| `infrastructure/mcp/mcpServer.ts` | ~~848~~ → 98 | RESUELTO (Fases A y B) |

## Tests sin factories compartidas

~196 `vi.mock` repartidos por los ficheros de test y practicamente ningun
fixture compartido. Ese boilerplate duplicado es lo que infla los ficheros de
test. `tests/unit/infrastructure/mcp/mcpTestFactories.ts` es el primer caso
extraido (Fase B) y sirve de patron: factories con `overrides` parciales.

Candidatos siguientes: `apps/ui/tests/unit/lib/api.test.ts` (1862 L) y los
hooks de UI con 20+ `vi.mock` por fichero (`useSessionReport`, `DashboardPage`).

## Deuda SOLID en infrastructure/mcp (Fase C, pendiente)

Detectada auditando el split; no se toco por ser reescritura de logica:

- `mcpToolkit.categorizeError` importa cuatro tipos de error concretos
  (`Elm327*`, `WebSearchProviderError`). Un modulo llamado "toolkit" acoplado a
  infraestructura concreta: anadir una fuente de errores obliga a editarlo (OCP).
- `handleIndexPid` y `handleIndexDtc` son estructuralmente casi identicos
  (resolver source → entry base → validacion opcional → indexar → formatear).
- `VehicleRepository | undefined` atraviesa varios handlers, cada uno repitiendo
  la guarda `if (vehicleRepo && ...)`. Null object o decorador de persistencia.
- `handleGetAvailablePids` tiene complejidad ciclomatica 11 (limite 5).

## Vectorial

Migrar a schema con columna JSON metadata para evitar migraciones futuras.

## GGA vs lint/prettier — RESUELTA

Causa raiz: el repo no estaba prettier-limpio (7 ficheros de `core-api`), asi que
cualquier `format:fix` durante un commit arrastraba ficheros no tocados. Se paso
`prettier --write` una vez y se anadio `apps/ui/.prettierignore` para excluir
`src/routeTree.gen.ts` (generado y gitignored). `pnpm verify` es ahora la puerta.
Errores de GGA pendientes en `docs/gga-pending-errors.md`.
