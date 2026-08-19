# Deuda conocida

> Cifras medidas sobre `develop`, no estimadas. Si corriges algo, **re-mide antes
> de editar aqui**: este fichero se ha desincronizado dos veces por actualizarlo
> de memoria.
>
> Estado general: 2003 tests en verde (1410 core-api + 593 ui), 0 errores de lint, 79 avisos (72 + 7).
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

## El bucle de aprendizaje de ECUs: escrito, sin calibrar

Actualizado el 2026-08-19. El bloque `ECU_LEARNING_INSTRUCTIONS` **ya existe** en
`application/prompts/cognitiveDiagnosisPrompt.ts`, simetrico a los de PID y DTC, con cinco
tests que lo blindan: nombra las tres tools de la cadena (`get_ecu_info`,
`search_similar_ecus`, `index_ecu`), exige buscar antes de indexar, pide los cuatro campos
obligatorios del schema de `index_ecu` y prohibe inventar nombres.

**Lo que sigue pendiente es medirlo.** Tocar el system prompt cambia el comportamiento del
agente, y este proyecto calibra esos cambios con `pnpm eval:agent`, que necesita la clave
del LLM y no se ha corrido nunca (ver la seccion anterior). Hay que correr **el grupo A
entero**, no solo B-E: un bloque nuevo de instrucciones puede volver al agente mas verboso
o mas reticente en consultas legitimas.

`get_freeze_frame` sigue sin nombrarse en el prompt, y es distinto: no es una cadena de
aprendizaje y el flujo determinista si lo usa.

## El transporte no se recupera tras agotar la reconexion

Detectado el 2026-08-19 grabando trazas, y reproducido dos veces. Si el dispositivo se cae
mas de 30 s, `createReliableTransport` agota su ventana de reconexion y **se queda muerto
para siempre**: la API responde `500` con `Reconnection failed after 30s` aunque el
emulador (o el coche) haya vuelto. Solo se arregla reiniciando el proceso.

En la demo con el coche real esto es un riesgo concreto: un cable de OBD movido medio
minuto deja la herramienta inservible hasta reiniciar. Documentado en `docs/guion-demo.md`
como paso de recuperacion.

## `cognitive-diagnosis` responde 404 donde el spec dice 503

`DiagnosisController.ts:451` devuelve `404` con `Cognitive diagnosis is not available`
cuando falta la configuracion del LLM, pero `openapi/routes/mcp.ts:78` documenta `503`
para ese caso. Ademas un `404` es el codigo equivocado: el recurso existe, lo que falta es
configuracion del despliegue.

## Las ECU aprendidas no llegan al mapa de topologia

`resolveDiscoveredEcus` (`mcp/diagnosticTools.ts`) cruza las ECU `UNKNOWN` contra
`ecu_definitions` y resuelve el nombre aprendido, pero **solo en la tool del agente**. El
camino REST (`GET /api/ecu-info`, que es el que pinta la pantalla de Topologia) devuelve
`ECU 7E9 / UNKNOWN` aunque el agente ya haya averiguado que es la caja de cambios.

No es una incoherencia aislada: **los PIDs se comportan igual**, la resolucion contra lo
aprendido vive en la capa MCP. Cambiarlo es una decision de diseno, no un parche.

## Funciones que superan las 40 lineas (13)

Las marca ESLint (`max-lines-per-function`, warn, solo `src/`). Ver "Excepciones
al limite de 40 lineas" en `AGENTS.md` antes de marcar ninguna como legitima.

| Funcion                                         | Lineas  |
| ----------------------------------------------- | ------- |
| `createReliableTransport`                       | **182** |
| `tokenize` / `evaluatePostfix` (math-parsers)   | 57      |
| `createAuthService`                             | 54      |
| `buildApp`                                      | 50      |
| `createAuthStack` / `upsertEcuDefinition`       | 49      |
| `createDiagnosisService`                        | 47      |
| `createKnowledgeStack` / `findSessions`         | 45      |
| Constructor (DiagnosisService)                  | 42      |
| `cognitiveDiagnosis` / `createLanceVectorStore` | 41      |

`createReliableTransport` es el peor del repo con diferencia.

## Complejidad ciclomatica >5

52 avisos en `src`. Los mayores: `wrapSdkError` (8), y un grupo en 6-7
(`validateVin`, `upsertEcuDefinition`, `upsertDtcDefinition`, `updateProfile`).
En `DiagnosisService` quedan `getVehicleInfo` (12) y `getLiveData` (11).

## Documentacion de la API: generada, no escrita

`swagger.ts` (1335 L, el fichero mas grande del repositorio) **ya no existe**. El
documento OpenAPI se construye en `infrastructure/http/openapi/`:

- Los schemas de **peticion** son los mismos objetos Zod con los que la aplicacion
  valida en runtime — no hay copia que pueda contradecirlos.
- Los de **respuesta** viven en `openapi/contracts/` y describen lo que proyectan los
  controladores.
- Las operaciones se declaran en `openapi/routes/`, junto al router que las sirve.
- `openapiSync.test.ts` recorre los routers reales de Express y falla si aparece una
  ruta sin documentar o un path documentado que no existe. Comprobado que salta.

Ese test es lo que hace irrepetible la deriva que teniamos: siete rutas servidas y sin
documentar, entre ellas `POST /api/mcp/cognitive-diagnosis`.

**Lo que sigue escribiendose a mano**, porque ninguna herramienta lo deduce: el tag, el
resumen, la descripcion y los codigos de respuesta de cada operacion. Son ~1 entrada
declarativa por ruta, no 936 lineas de JSON anidado.

**Pendiente relacionado**: los contratos de respuesta solo se usan para documentar. Usarlos
tambien para validar lo que devuelven los controladores cerraria el circulo — hoy se valida
la entrada pero no la salida.

## God files (coste de contexto)

| Modulo                                                   | Estado                                                                                                                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infrastructure/mcp/mcpServer.ts`                        | ~~848 L~~ → 98 L — **RESUELTO** (Fases A y B)                                                                                                                                                   |
| `infrastructure/services/diagnosisService.ts`            | ~~969 L~~ → ~~786 L~~ → **586 L** — **REDUCIDO, no resuelto**: el flujo cognitivo salio a `services/cognitive/cognitiveDiagnosisRunner.ts`, pero sigue siendo el fichero mas grande del backend |
| `infrastructure/persistence/sqlite/vehicleRepository.ts` | ~~632 L~~ → **181 L** — **RESUELTO**: un store por agregado en `sqlite/vehicle/`                                                                                                                |
| `infrastructure/composition/composition.ts`              | ~~579 L~~ → **100 L** — **RESUELTO**: repartido por areas en `composition/`                                                                                                                     |
| `infrastructure/http/controllers/DiagnosisController.ts` | ~~578 L~~ → **479 L** — **REDUCIDO, no resuelto**: los schemas Zod viven ya en `application/dto/diagnosis/`, pero partir el controlador obligaria a tocar `diagnosis.routes.test.ts` (1241 L)   |
| `apps/ui/src/lib/api.ts`                                 | ~~658 L~~ → **438 L** (test 1582 L) — el fichero bajo; el test sigue siendo el mas grande del repo                                                                                              |

> Cifras remedidas el 2026-08-19. `seedManufacturerCatalog.ts` (645 L) **no** cuenta:
> son 73 entradas de datos sembrados, no logica.
>
> **Ojo con el "RESUELTO"**: solo lo son los tres que bajaron de 200 lineas
> (`mcpServer`, `vehicleRepository`, `composition`). Los dos marcados _reducido_ siguen
> siendo los ficheros mas grandes del backend y siguen contando como deuda.

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

**Actualizado el 2026-08-19, y la sospecha queda DESCARTADA.** Se levanto el emulador y se
midio la secuencia completa sobre una sola conexion: tras el barrido, con el restore
`AT H0` + `AT SH 7E0` que ya hacia el codigo, un `01 0C` responde `41 0C 0C 08` con
normalidad. Comprobado ademas end-to-end por la API: `GET /api/live-data` devuelve los
mismos valores antes y despues de un barrido de ECUs.

Es decir, **el estado que deja el barrido no explica aquel fallo**. Lo que si estaba mal era
el comentario del codigo, que llamaba a `7E0` "el header por defecto" —el valor de fabrica
del ELM327 es `7DF`—; corregido, pero el comando era el correcto: con `7DF` puesto las
lecturas devuelven `NO DATA`.

La causa del `live-data` en null **sigue sin identificar**. Si reaparece, esta pista ya esta
gastada y hay que mirar en otro sitio.

## Vectorial

Migrar a schema con columna JSON metadata para evitar migraciones futuras.

## Ramas

El proxy de git del entorno remoto rechaza el borrado de ramas (403 al
`push --delete`). Estas quedaron sin borrar y hay que quitarlas desde la UI de
GitHub; su contenido ya esta integrado, asi que borrarlas no pierde nada:

- `origin/refactor/split-mcp-server`
- `origin/refactor/openapi-from-zod` — mergeada en `develop` el 2026-08-18

---

## Resuelto

- **Deuda SOLID en `infrastructure/mcp`** (Fase C): `categorizeError` desacoplado
  — cada error declara su categoria via `CategorizedError` en
  `application/shared/errorCategory.ts`, y el toolkit no conoce ningun tipo
  concreto. Guardas repetidas de `vehicleRepo` aisladas. El modulo entero quedo
  con **0 warnings**.
  - _No_ se unificaron `handleIndexPid`/`handleIndexDtc`: el patron se repite 2
    veces, no 3+, y la regla DRY del proyecto pide 3+.
  - _No_ se aplico Null Object a `VehicleRepository | undefined`: ~19 stubs no-op
    para eliminar 4 guardas, y ni asi bajaba del umbral de complejidad.
- **GGA vs lint/prettier**: el repo no estaba prettier-limpio (7 ficheros), asi que
  cualquier `format:fix` arrastraba ficheros no tocados. Resuelto pasando prettier
  una vez + `apps/ui/.prettierignore` para `routeTree.gen.ts` (generado y gitignored).
- **CI no validaba nada**: corria solo en `main` y solo sobre `core-api`, asi que
  `develop` no se verificaba y los 61 ficheros de test de la UI no corrian nunca.
  Ahora matriz `core-api` + `ui` sobre push/PR a `main` y `develop`.
- **`brace-expansion`**: resuelta.
- **Arranque en clon limpio**: `getDb` crea el directorio de `DB_PATH` con
  `mkdir -p` antes de abrir la conexion (`db.ts`), porque `better-sqlite3` no lo hace
  y `apps/core-api/data/` esta gitignored. Cubierto por `db.test.ts`.
- **`swagger.ts` como god file**: el documento OpenAPI se genera desde el codigo.
- **Coverage bajo umbral**: ningun fichero incumple ya. Al remedir aparecio un cuarto
  que no estaba documentado (`traceConsole.ts`, functions 66,66 %). `withTimeout.ts` y
  `sdkErrorUtils.ts` no tenian test ninguno; `diagnosisKnowledgeMapper.ts` cubria el
  camino feliz pero no las guardas de `deserializeList` (campo ausente, no-string, JSON
  corrupto, JSON que no es array).
- **Los tests de la UI, fuera de lint y formato**: `lint` y `format` de `apps/ui` ya
  cubren `tests/` ademas de `src/`. La estimacion que habia aqui ("~1129 errores de
  `prettier/prettier`") era **de antes de formatear**: aplicado `prettier --write`
  quedaban 3 errores reales, todos arreglados sin suprimir ninguna regla — un escape
  sobrante en un regex y dos helpers `wrapper` que llaman a `useState` y pasan a
  `Wrapper`. Los 71 ficheros entran con 0 errores y sin anadir un solo aviso.
