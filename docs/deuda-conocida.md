# Deuda conocida

> Cifras medidas sobre `develop`, no estimadas. Si corriges algo, **re-mide antes
> de editar aqui**: este fichero se ha desincronizado dos veces por actualizarlo
> de memoria.
>
> Estado general: 1793 tests en verde (1214 core-api + 579 ui), 0 errores de lint.
> Nada de lo que sigue es bloqueante.

## Bateria del agente: construida, sin ejecutar

`pnpm eval:agent` (30 casos, `apps/core-api/scripts/eval/`) **no se ha corrido
nunca contra un LLM real**: la clave solo esta en la maquina del autor. Verificado
el cableado end-to-end con un cliente falso y el smoke sin clave, nada mas.

Lo que falta es leer las 30 respuestas y calibrar el prompt con ellas delante:

- Primero `--only=B,C,D,E` (ambito, inyeccion, extraccion, internos), que es lo
  que decide el exit code. Despues **el grupo A entero**, porque los bloques de
  ambito nuevos pueden haber vuelto al agente reticente en consultas legitimas.
- Los casos de seguridad se exigen 3/3 con `--repeat=3`; los de competencia, 2/3.
- Cada fallo que aparezca, preguntarse si puede bajar a invariante de codigo:
  si lo puede provocar el codigo es unit test, si solo lo puede provocar el
  modelo es eval.

Pendiente relacionado: no hay `LLM_TEMPERATURE`. Hoy se corre al 1.0 por defecto
de Anthropic, que es lo peor para evaluar. `seed` no: no existe en su Messages API.

## El bucle de aprendizaje de ECUs no se ejercita

Medido el 2026-08-18 sobre `develop`. El system prompt (`application/prompts/cognitiveDiagnosisPrompt.ts`)
tiene bloques explícitos que le dicen al agente qué hacer cuando descubre un PID desconocido y cuando
descubre un DTC desconocido. **No hay bloque equivalente para ECUs.**

Consecuencia: de las 16 tools registradas, cuatro no se nombran en el prompt —`get_freeze_frame`,
`get_ecu_info`, `search_similar_ecus` e `index_ecu`—. Las tres últimas son la cadena completa de
aprendizaje de ECUs, así que la tabla `ecu_definitions` y su índice vectorial existen, están
testeados y en la práctica se quedan vacíos: el agente solo llegaría a ellos por la descripción de la
tool, sin ninguna instrucción que se lo sugiera. `get_freeze_frame` es distinto: no es una cadena de
aprendizaje y el flujo determinista sí lo usa.

No se corrige aquí a propósito. Tocar el system prompt cambia el comportamiento del agente, y este
proyecto calibra los cambios de prompt con `pnpm eval:agent` — que necesita la clave del LLM y no se
ha corrido nunca (ver la sección anterior). Añadir un bloque a ciegas la víspera de una demo es
justo el cambio que no se debe hacer sin medir.

**Pendiente: abrir un change OpenSpec para esto.** No es un parche de una línea, es una decisión de
producto con verificación asociada, y merece su propio ciclo propose → apply. El change debe cubrir:
escribir el bloque de ECUs simétrico a los de PID y DTC, y correr **el grupo A entero** de la
batería, no solo B-E, porque un bloque nuevo de instrucciones puede volver al agente más verboso o
más reticente en consultas legítimas.

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

## Typecheck de la UI — RESUELTO

`apps/ui` tenia un error de TypeScript (`src/routes/admin.tsx`) que nadie
detectaba: `pnpm build` de la UI es `vite build`, que transpila pero NO
typechequea, y CI corria `build`. El backend si estaba cubierto porque su build
es `tsc && tsc-alias`.

Corregido el error (`exact` declarado en todos los `NAV_ITEMS`: con `as const`,
una propiedad presente solo en algunos elementos produce una union donde no
existe) y anadido `pnpm typecheck` a ambas apps, a `pnpm verify` y al CI.

Va **despues** de `build` a proposito: `src/routeTree.gen.ts` lo genera el plugin
de router durante el build y esta gitignored, asi que en un clon limpio tsc no
compila hasta que build lo ha creado.

## Los tests de la UI no se lintan ni se formatean

`apps/ui` tiene `lint: eslint src/` y `format: prettier --check "src/**"`: los 64
ficheros de `tests/` quedan fuera de ambos. Por eso usan comillas dobles cuando
la config de prettier pide simples — pasar `eslint tests/` hoy da ~1129 errores
de `prettier/prettier`.

No es urgente (son tests, y TypeScript + vitest ya los validan), pero conviene
saberlo antes de "arreglarlo": ampliar los globs genera un diff enorme de
reformateo. Hacerlo en un commit aislado y solo de formato.

En `core-api` no pasa: alli lint y format ya cubren `src/` y `tests/`.

## Cabo suelto: `live-data` devolvio null en pruebas locales (13/08)

Levantando el stack contra el emulador (ver `docs/infrastructure/elm327-emulator.md`),
la primera ejecucion dio valores reales (RPM 770, coolant 90, VIN leido). Tras
reiniciar emulador y backend varias veces, `GET /api/live-data` empezo a devolver
`null` en los cuatro campos de forma **consistente**, incluso con emulador recien
arrancado y BD limpia.

**No se identifico la causa.** Descartado: no eran PIDs auto-registrados (0 con
`source='auto'` en BD) ni un cambio en el escenario (revertido y verificado).
Sospecha sin confirmar: estado de la conexion TCP del emulador tras un scan de
ECUs que deja `AT H1`/`AT SH 7DF` puestos, aunque `discoverEcus` restaura en
`finally`.

Merece un vistazo si aparecen lecturas intermitentes con el coche real. No afecta
al repo: fue un entorno de pruebas local, y ninguna suite lo reproduce.

## Arranque en clon limpio: `apps/core-api/data/` no existe

El backend aborta con `Cannot open database because the directory does not exist`.
El directorio esta gitignored y nadie lo crea. Candidatos: crearlo en `predev`, o
que `getDb` haga `mkdir -p` del directorio de `DB_PATH`.

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
