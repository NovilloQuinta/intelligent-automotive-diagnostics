# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Entrega: 20 julio 2026

## SYSTEM INSTRUCTIONS & EXECUTIVE PROTOCOL

### CORE OPERATIONAL MANDATE

You MUST strictly follow all guidelines, constraints, and instructions defined in this file at ALL times. Ignores, skips, or hallucinations regarding these rules are considered critical failures.

### REQUIRED PRE-RESPONSE REASONING STEP

Before generating ANY answer, code, or explanation requested by the user, you MUST complete an internal verification pass:

1. Scan the instructions in this file to identify the applicable rules from `REGLAS DE SESION` (rules 0-9) and `PRINCIPIOS DE CODIGO` (DRY, KISS, Code Smell) for the user's request.
2. In your response output, begin with a brief structural header: `[Rules Applied: Rule X, Rule Y]` referencing the rule numbers that apply.
3. If no specific rule applies, state `[Rules Applied: Standard Compliance]`.
4. Proceed to deliver the user's answer while maintaining full compliance.

### CONTEXT DRIFT PREVENTION

If the conversation grows long, you MUST NOT relax or bypass these system rules. If a user request contradicts a core rule in this file, explicitly flag the contradiction before proceeding.

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura
- **Flujo de ramas (nuevo)**: creada la rama `develop` desde `main` (b0f65bb, sin push). Desde ahora `develop` es la rama de integración de desarrollo: toda `feat/*`/`fix/*` sale desde `develop` y se mergea ahí. `main` queda reservada para releases (el deploy en Actions se añadirá más adelante). No mergear a `main` salvo petición explicita de release.
- **En curso (este cambio)**: `add-freeze-frame-screen` en la rama `feat/freeze-frame-screen` (desde `develop` @ b8387ca, sin worktree). Implementado de punta a punta: (1-2) `ObdSimulator.getFreezeFrame(dtc?)` filtra por `dtcCode` exacto (null si no coincide); (3-4) `DiagnosisService.getFreezeFrame(scenarioId?, dtc?)` + endpoint `GET /api/freeze-frame?scenarioId=&dtc=` (handler con Zod sobre `req.query`, ruta, swagger, rate limiter 20/min); (5-6) UI: `DtcPanel` seleccionable (`onSelect`/`selectedCode`, fila seleccionada), hook `useFreezeFrame`, `FreezeFramePanel` (estados: sin selección / cargando / error / sin frame / tabla de PIDs), integrado en `DashboardPage` con `selectedDtc` (lifting state, reset al cambiar escenario). `selectBodySchema` generalizado a `selectSchema` (usa el mismo helper para body y query). Pendiente: pedir OK para commitear y merge a `develop`.
- **En curso**: `fix-security-and-mcp-findings` (14 hallazgos GGA) en la rama `fix/diagnosis-service-typed-errors` (desde `develop`). Tareas 1-5 y 6.1 completadas (545 tests verdes). 6.3 decidido: GGA revisa el **fichero completo** en pre-commit (decision usuario 7 ago; `--pr-mode --diff-only` para PRs grandes). **6.2 completado + nueva config GGA**: `PROVIDER="opencode:deepseek/deepseek-v4-flash"` en `.gga` (decision usuario 7 ago: las reviews de GGA —fichero completo, una llamada LLM por run— quemaban el limite de sesion de Claude; DeepSeek via opencode no cuenta contra esa sesion). PASS con 3 warnings no bloqueantes (magic strings preexistentes). Review puntual con Claude: `GGA_PROVIDER="claude" gga run`. Pendiente: 6.5 (pedir OK para commitear) y merge a `develop`.
- **Siguiente**: tras cerrar `fix-security-and-mcp-findings` y `add-freeze-frame-screen`, quedan el #2 (confianza + validacion OBD + 7 tools MCP) y el #3 (inyeccion RAG en el caso de uso + wiring) del ADR-007, mas 4 cambios propuestos sin empezar: `add-cognitive-pid-discovery`, `add-diagnosis-session-report-screen`, `add-ecu-info-screen`, `add-vehicle-autodetect-flow`.
- **Agente `@ui`** (viene de `main`): creado agente frontend React — `.opencode/agents/ui.md` + wrapper `.claude/agents/ui.md`; registrado en la matriz de enrutamiento del orquestador y en la tabla de agentes. Rol: `@ui` implementa frontend (`apps/ui/`) con `react-best-practices` + TDD; `@writer` sigue siendo backend (`core-api`). Pipeline definido por el usuario: orquestador → ui → writer → review → quality. Pendiente: implementar las pantallas de los cambios OpenSpec `add-ecu-info-screen`, `add-freeze-frame-screen`, `add-diagnosis-session-report-screen` (y opcionalmente `add-vehicle-autodetect-flow`, `add-cognitive-pid-discovery`).
- **Contexto previo**: ambos cambios mergeados a `main` y archivados en OpenSpec. (1) `fix-clean-architecture-deviations` (archivado en `openspec/changes/archive/2026-08-06-fix-clean-architecture-deviations/`): `DiagnosisService` extraido a `src/infrastructure/services/diagnosisService.ts` (errores tipados: `DiagnosisScenarioNotFoundError`, `CognitiveDiagnosisUnavailableError`, `ToolNotFoundError`, `ToolCallTimeoutError`, `CognitiveDiagnosisTimeoutError`); `DiagnosisController` recibe el servicio por constructor; `LoggerPort` inyectado en `ExecuteLlmToolCalling` (sin `console.error`); composicion centralizada en `composition.ts`. (2) `refactor-elm327-persistent-session` (archivado en `openspec/changes/archive/2026-08-06-refactor-elm327-persistent-session/`): sesión TCP persistente con cola FIFO, auto-reconexión con backoff exponencial y cierre graceful; circuit breaker eliminado; `ProcessVehicleDiagnosisUseCase` ejecuta lecturas secuencialmente. Delta spec `elm327-tcp-repository` sincronizado a `openspec/specs/elm327-tcp-repository/spec.md`.
- **Entregado en el cambio** (cambio #1 de 3 del RAG auto-expansivo, ADR-007): `apache-arrow@18.1.0` como dependencia explicita; `LANCEDB_PATH` en configuracion; **corregido un bug latente** por el que el mapeo de tipos reventaba con `string` y `boolean` (LanceDB solo conoce `utf8`/`bool`), ahora mapeados a clases Arrow reales; `ensureVectorTable` con columna `FixedSizeList(384, Float32)`; `assertVectorDimensions` porque **LanceDB no valida dimensiones — rellena con `null` o trunca en silencio**; 4 puertos y 3 DTOs de conocimiento; `createKnowledgeIndex` sobre `VectorStore` + `EmbeddingGenerator`; `createLanceVectorStore` con escapado de predicados; los 3 repositorios (`pids_index`, `dtcs_index`, `diagnoses_index`). Tests de integracion contra LanceDB real, que son los que cazaron los fallos.
- **Costura VectorStore**: tras revision, se introdujo el puerto de bajo nivel `VectorStore` (+ `EmbeddingGenerator`, este ultimo como `export type` de funcion al estilo de `ToolCallHandler`). `createKnowledgeIndex` y los 3 mappers viven en `application/knowledge/` sin una sola referencia a LanceDB; `lanceVectorStore.ts` es el unico modulo acoplado al motor y se lleva el escapado de predicados y la guarda de dimensiones. `KnowledgeSource` movido a `domain/value-objects/`. Los 27 DTOs agrupados en `dto/{auth,vector,llm,diagnosis,knowledge,audit}/`. Campos renombrados para no necesitar comentario: `text`→`embeddedText`, `validated`→`obdValidated`.
- **Codigo eliminado en revision** (regla KISS, `AGENTS.md:162`): `ensureTable` (huerfana tras el refactor, y una tabla sin vectores no pinta nada en LanceDB teniendo SQLite), `createVectorIndex` + `MIN_ROWS_FOR_VECTOR_INDEX` (0 usos y umbral estimado sin medir) y `transformersEmbeddingGenerator` (alias inutil: `createEmbedding` ya cumple la firma del puerto). La regresion del bug de tipos se conservo moviendola al test de `ensureVectorTable`.
- **Tests**: core-api 556 pasando, 0 fallos, 47 test files; UI 196 pasando + 1 skipped, 28 test files
- **CI**: verde — lint, format, test, build (gate de raiz: core-api). El lint de UI (`apps/ui`) esta roto por la deuda `brace-expansion` (ver abajo) — preexistente, no lo detecta el gate de raiz.
- **Deuda conocida**: (1) el override `brace-expansion: '>=5.0.9'` (pnpm-workspace.yaml) rompe `minimatch@3` que usa `@eslint/config-array` de ESLint 9 — por eso `pnpm test:coverage` (core-api) **y** `pnpm lint` (apps/ui) fallan con `TypeError: expand is not a function`. Requiere su propio cambio: toca un override de seguridad. (2) **No hay flujo de migraciones de DB**: no existe `drizzle/` ni nada versionado en git, `main.ts` no migra al arrancar (getDb solo abre conexion), y los tests crean las tablas a mano con `CREATE TABLE` inline. El esquema evoluciona (ej. `users.failed_login_attempts`/`locked_until`, `audit_logs.user_id` del fix de seguridad) sin forma versionada de propagarlo. Detectado 7 ago al regenerar la DB de dev con `db:push` (un arreglo de entorno, no reproducible). Pendiente: cambio propio `chore/add-db-migrations` — `pnpm db:generate`, versionar `drizzle/`, y `migrate(db, ...)` en el arranque de `main.ts` antes de `app.listen()`.

## REGLAS DE SESION

0. **Guardar en Engram** — tras cada accion no trivial (bugfix, decision de diseno, descubrimiento, nuevo patron), llama a `mem_save` INMEDIATAMENTE. No esperes al cierre de sesion. Si tienes duda, guarda.
1. **Orquestar antes de actuar** — ante cualquier tarea, delega en `@orchestrator`. El emite JSON de enrutamiento (agente + skills). Si el orquestador no emite JSON estructurado, es un bug — no continues sin enrutamiento explicito. **Aplica TAMBIEN a flujos OpenSpec** (`/opsx-apply`, `/opsx-archive`, ...): el CLI planifica el QUE, pero el COMO (agente + skills) lo decide `@orchestrator` antes de tocar codigo. Prohibido implementar tareas de un cambio sin enrutamiento previo.
2. **Descubrir antes de crear** — carga skills (`skill`), busca en Engram (`mem_search`), revisa el codebase. Prohibido reescribir logica que ya exista. Los agentes orquestan skills; no escriben logica monolítica.
3. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
4. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR
5. **Trabajar en ramas; `develop` es la rama de integración** — cada cambio en su rama (`git checkout -b feat/xxx` o `fix/xxx`), **siempre desde `develop`**. Solo merge a `develop` cuando CI pase verde. Cambios menores (docs, chore, style) directo a `develop`. `main` queda reservada para releases (deploy en CI se añadirá más adelante): no se mergea a `main` salvo petición explicita de release.
5b. **Verificar ruta del worktree antes de escribir** — si trabajas en un worktree (`.claude/worktrees/xxx/`), TODO agente y toda operacion `Write`/`Edit` DEBE usar la ruta del worktree, NUNCA la del repo principal. Antes de escribir un archivo, confirma que el path contiene `.claude/worktrees/`. Si un agente escribe en el repo principal estando en un worktree, es un fallo critico.
6. **Checks pre-push**: `pnpm lint && pnpm format && pnpm test && pnpm build`
7. **Preguntar antes de commitear/pushear** — mostrar resumen de cambios, esperar OK humano
8. **Tras cada paso**: actualizar `SESION ACTUAL` en este mismo fichero
9. **Auto-auditoria post-tarea** — al terminar una tarea no trivial: skills usadas, agentes delegados, codigo nuevo estrictamente necesario.

## AGENTES DISPONIBLES

Invoca con `@nombre` o via Task tool. Definidos en `.opencode/agents/`.

| Agente | Modelo | Rol |
|---|---|---|
| `@orchestrator` | sonnet | Enruta tareas al sub-agente y skill correctos. Salida JSON estructurada. |
| `@writer` | sonnet | Implementa codigo (backend/core-api) con TDD + Clean Architecture + Zod |
| `@ui` | sonnet | Implementa pantallas/componentes React en apps/ui/ con TDD + react-best-practices |
| `@architect` | sonnet | Disena specs OpenSpec, propone cambios, mantiene coherencia entre artifacts |
| `@reviewer` | haiku | Revisa TypeScript, TSDoc, Clean Architecture, DRY, KISS, code smells (read-only) |
| `@quality` | haiku | Ejecuta lint + test + coverage + audit y reporta |
| `@security` | haiku | Audita reglas OWASP: CORS, helmet, JWT, rate-limit, Zod (read-only) |

## PIPELINE MULTI-PASO

El modo pipeline permite ejecutar tareas de forma secuencial con review gates entre
cada paso: writer → reviewer → (corregir si FAIL) → siguiente tarea.

### Activación

Usa keywords como `pipeline`, `multi-paso`, `paso a paso`, `con revisión`,
`review gate`, o `tdd con review`. El `@orchestrator` detecta estas keywords y
emite un JSON con `mode: "pipeline"` y un `pipeline_plan`.

### Flujo

```
Usuario: "implementa las tareas con pipeline"
           ↓
   @orchestrator (mode: pipeline)
     - Diseña pipeline_plan con steps alternados (implement → review → ...)
     - Guarda plan en .opencode/pipeline-state.json
     - Emite step 1 → delega a @writer
           ↓
   @writer (modo pipeline — 1 módulo)
     - Implementa task del step actual
     - Reporta con ---pipeline_context---
           ↓
   @orchestrator (re-invocación)
     - Lee pipeline-state.json + evalúa gate
     - Si gate_after: emite step review → delega a @reviewer
           ↓
   @reviewer (modo pipeline — solo files_to_review)
     - Revisa archivos indicados
     - Reporta con ---gate_result---
           ↓
   @orchestrator (evalúa gate)
     - FAIL (violaciones graves) → re-emite step implement (misma task)
     - PASS_WITH_WARNINGS → emite siguiente step (con warnings)
     - PASS → emite siguiente step
           ↓
   ... (ciclo se repite hasta completar pipeline_plan)
           ↓
   @orchestrator elimina pipeline-state.json → pipeline completado
```

### Review Gate Decision Tree

| gate_result.result | Condición | Acción |
|---|---|---|
| `FAIL` | Violaciones graves > max_grave_violations | Re-implementar misma task |
| `PASS_WITH_WARNINGS` | graves = 0, warnings > 0 pero <= max_warnings | Avanzar (con warnings en payload) |
| `PASS` | graves = 0, warnings = 0 | Avanzar |

### Archivo de estado

- **`.opencode/pipeline-state.json`**: creado por el orquestador al iniciar pipeline,
  eliminado al completar. Contiene `pipeline_plan`, `current_step`, `completed_steps`,
  `gate_results`, y timestamps.

### Reglas de delegación actualizadas

- **1 tarea = 1 agente en 1 step.** No se delegan múltiples agentes en paralelo.
- **Pipeline secuencial SÍ está permitido**: un agente tras otro, con review gates validados por el orquestador.
- Si un sub-agente se desvía de su fase (ej. writer intenta revisar), el orquestador cancela y re-enruta.

## SKILLS

| Skill | Path | Cuando cargar |
|---|---|---|
| `clean-architecture` | `.opencode/skills/clean-architecture/` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | `.opencode/skills/typescript-best-practices/` | Al escribir o revisar TypeScript |
| `tdd-workflow` | `.opencode/skills/tdd-workflow/` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `tsdoc-jsdoc-documentation` | `.opencode/skills/tsdoc-jsdoc-documentation/` | Antes de crear o revisar TSDoc en exports publicos |
| `coverage-strategy` | `.opencode/skills/coverage-strategy/` | Al configurar thresholds, revisar coverage, o decidir que testear |
| `openspec-propose` | `.opencode/skills/openspec-propose/` | Al proponer un cambio nuevo (design + specs + tasks) |
| `openspec-apply-change` | `.opencode/skills/openspec-apply-change/` | Al implementar tareas de un cambio OpenSpec |
| `openspec-archive-change` | `.opencode/skills/openspec-archive-change/` | Al archivar un cambio completado |
| `openspec-explore` | `.opencode/skills/openspec-explore/` | Modo exploracion — pensar sin implementar |
| `openspec-update-change` | `.opencode/skills/openspec-update-change/` | Al actualizar artifacts de un cambio existente |
| `openspec-sync-specs` | `.opencode/skills/openspec-sync-specs/` | Al sincronizar delta specs con main specs |

## MEMORIA PERSISTENTE (Engram)

Engram es un "segundo cerebro". Guarda lo que **no es obvio** del codigo.
Antes de trabajar en un area nueva, busca contexto con `mem_search`.

**Que guardar** (proactivo, regla #0 — NO esperar):
- Bugs y sus causas raiz (el "por que pasaba", no el diff — eso ya esta en git)
- Decisiones de diseno no obvias (ej. "factory functions vs clases porque...")
- Discoveries / gotchas (ej. "SQLite no soporta X, asi que usamos Y")
- Cambios de reglas de sesion o preferencias del usuario

**Que NO guardar**:
- Artifacts OpenSpec — ya estan en `openspec/changes/`
- Tareas completadas — para eso esta `mem_session_summary`
- Cosas que cualquier agente puede deducir leyendo el codigo

## PRINCIPIOS DE CODIGO

`@reviewer` evalua estos principios en cada revision:

- **DRY** — Sin duplicacion de logica no trivial. Si un patron se repite 3+ veces, extraer a funcion/utilidad compartida. Excepcion: tests.
- **KISS** — La solucion mas simple posible. Sin abstracciones prematuras, sin factory de factories. Una funcion = una responsabilidad clara.
- **Code Smell** — Funciones >40 lineas, parametros >4, anidamiento >3 niveles, comentarios explicando QUE hace el codigo, magic strings/numbers sin nombre, imports no usados.

## Scripts

```bash
# OBD (raiz)
pnpm tsx scripts/send-obd.ts "01 0C"    # enviar comando OBD al emulador
pnpm tsx scripts/scan-pids.ts           # escanear PIDs soportados

# DB (apps/core-api)
pnpm drizzle-kit generate               # generar migraciones desde schema.ts
pnpm drizzle-kit migrate                # aplicar migraciones a SQLite

# Tests
pnpm test                               # vitest run
pnpm test:coverage                      # coverage (Features >=80% + Core 100%)
```
