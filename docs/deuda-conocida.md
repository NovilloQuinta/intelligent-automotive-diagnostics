# Deuda conocida

> Cifras medidas sobre `develop`, no estimadas. Si corriges algo, **re-mide antes
> de editar aqui**: este fichero se ha desincronizado dos veces por actualizarlo
> de memoria.
>
> Estado general: 1732 tests en verde (1180 core-api + 552 ui), 0 errores de lint,
> coverage 97% statements / 97.8% functions. Nada de lo que sigue es bloqueante.

## Coverage: 3 ficheros bajo umbral

| Fichero | Metrica | Actual | Umbral |
|---|---|---|---|
| `src/application/knowledge/diagnosisKnowledgeMapper.ts` | branches | 57.14% | 60% |
| `src/application/shared/withTimeout.ts` | functions | 50% | 90% |
| `src/infrastructure/llm/sdkErrorUtils.ts` | lines / statements | 73.33% | 80% |

Preexistentes: no los introdujo ningun cambio reciente.

## Funciones que superan las 40 lineas (13)

Las marca ESLint (`max-lines-per-function`, warn, solo `src/`). Ver "Excepciones
al limite de 40 lineas" en `AGENTS.md` antes de marcar ninguna como legitima.

| Funcion | Lineas |
|---|---|
| `createReliableTransport` | **182** |
| `tokenize` / `evaluatePostfix` (math-parsers) | 57 |
| `createAuthService` | 54 |
| `buildApp` | 50 |
| `createAuthStack` / `upsertEcuDefinition` | 49 |
| `createDiagnosisService` | 47 |
| `createKnowledgeStack` / `findSessions` | 45 |
| Constructor (DiagnosisService) | 42 |
| `cognitiveDiagnosis` / `createLanceVectorStore` | 41 |

`createReliableTransport` es el peor del repo con diferencia.

## Complejidad ciclomatica >5

52 avisos en `src`. Los mayores: `wrapSdkError` (8), y un grupo en 6-7
(`validateVin`, `upsertEcuDefinition`, `upsertDtcDefinition`, `updateProfile`).
En `DiagnosisService` quedan `getVehicleInfo` (12) y `getLiveData` (11).

## God files (coste de contexto)

| Modulo | Estado |
|---|---|
| `infrastructure/mcp/mcpServer.ts` | ~~848 L~~ → 98 L — **RESUELTO** (Fases A y B) |
| `infrastructure/services/diagnosisService.ts` | ~~969 L~~ → 714 L — Fase A hecha; queda Fase B (test de 1631 L) |
| `infrastructure/http/swagger.ts` | 1319 L — no es refactor: **deberia generarse**, no escribirse |
| `apps/ui/src/lib/api.ts` | 658 L (test 1862 L) — pendiente |

## Tests sin factories compartidas

~196 `vi.mock` repartidos por los ficheros de test y casi ningun fixture
compartido. Es lo que infla los ficheros de test.

`tests/unit/infrastructure/mcp/mcpTestFactories.ts` es el primer caso extraido y
sirve de patron: factories con `overrides` parciales.

Candidatos siguientes: `apps/ui/tests/unit/lib/api.test.ts` (1862 L) y los hooks
de UI con 20+ `vi.mock` por fichero (`useSessionReport`, `DashboardPage`).

## Vectorial

Migrar a schema con columna JSON metadata para evitar migraciones futuras.

## Ramas

`origin/refactor/split-mcp-server` quedo sin borrar: el proxy de git del entorno
remoto rechaza el borrado de ramas. Hay que quitarla desde la UI de GitHub.

---

## Resuelto

- **Deuda SOLID en `infrastructure/mcp`** (Fase C): `categorizeError` desacoplado
  — cada error declara su categoria via `CategorizedError` en
  `application/shared/errorCategory.ts`, y el toolkit no conoce ningun tipo
  concreto. Guardas repetidas de `vehicleRepo` aisladas. El modulo entero quedo
  con **0 warnings**.
  - *No* se unificaron `handleIndexPid`/`handleIndexDtc`: el patron se repite 2
    veces, no 3+, y la regla DRY del proyecto pide 3+.
  - *No* se aplico Null Object a `VehicleRepository | undefined`: ~19 stubs no-op
    para eliminar 4 guardas, y ni asi bajaba del umbral de complejidad.
- **GGA vs lint/prettier**: el repo no estaba prettier-limpio (7 ficheros), asi que
  cualquier `format:fix` arrastraba ficheros no tocados. Resuelto pasando prettier
  una vez + `apps/ui/.prettierignore` para `routeTree.gen.ts` (generado y gitignored).
- **CI no validaba nada**: corria solo en `main` y solo sobre `core-api`, asi que
  `develop` no se verificaba y los 61 ficheros de test de la UI no corrian nunca.
  Ahora matriz `core-api` + `ui` sobre push/PR a `main` y `develop`.
- **`brace-expansion`**: resuelta.
