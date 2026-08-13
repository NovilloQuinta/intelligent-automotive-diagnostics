# Deuda conocida

> Extraido de `AGENTS.md` para no cargarlo en el contexto de cada agente.

## Coverage thresholds

`pnpm test:coverage` falla por ficheros bajo umbral: `composition.ts` (~32% lines),
`simulatorAdapter.ts`, `lancedb.ts`, `AdminController.ts`, `ProfileController.ts`,
`diagnosisService.ts` (funciones ~88% vs 90%), `elm327Adapter.ts` (funciones ~89% vs 90%).
Subir tests o ajustar umbrales por archivo.

## GGA vs lint/prettier — RESUELTA

Causa raiz: el repo no estaba prettier-limpio (7 ficheros de `core-api` con
formato pendiente), asi que cualquier `format:fix` durante un commit arrastraba
ficheros no tocados y ensuciaba el diff. Se paso `prettier --write` una vez sobre
esos 7 ficheros y se anadio `apps/ui/.prettierignore` para excluir
`src/routeTree.gen.ts` (generado y gitignored — nunca podia pasar el check).

`pnpm verify` es ahora la puerta: si pasa en local, `format` no reformateara nada
ajeno en el commit. Errores de GGA pendientes siguen en `docs/gga-pending-errors.md`.

## Vectorial

Migrar a schema con columna JSON metadata para evitar migraciones futuras.

## God files (coste de contexto)

Modulos que, junto a su test, superan los 15k tokens por lectura. Cada ciclo
writer→reviewer→quality los paga varias veces:

| Modulo | Lineas src | Lineas test | ~Tokens por lectura del par |
|---|---|---|---|
| `infrastructure/services/diagnosisService.ts` | 967 | 1626 | ~23.000 |
| `apps/ui/src/lib/api.ts` | 658 | 1862 | ~21.000 |
| `infrastructure/mcp/mcpServer.ts` | 848 | 1094 | ~17.000 |
| `http/controllers/DiagnosisController.ts` | 528 | 1165 | ~15.000 |
| `infrastructure/http/swagger.ts` | 1319 | — | deberia generarse, no escribirse |

Partirlos por responsabilidad es el mayor ahorro pendiente. Requiere su propio
change con TDD.

## Tests sin factories compartidas

196 `vi.mock` repartidos por 166 ficheros de test y **cero fixtures/builders
compartidos** (solo `tests/setup.ts`). `useSessionReport.test.ts` tiene 23 `vi.mock`,
`DashboardPage.test.tsx` 20. Ese boilerplate duplicado es lo que infla los ficheros
de test a 1800 lineas. Extraer a `tests/helpers/`.
