# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Demo: semana del 10 de agosto 2026 (web publicada + coche real por cable)

## INSTRUCCIONES DE SISTEMA Y PROTOCOLO EJECUTIVO

### MANDATO OPERATIVO PRINCIPAL

DEBES seguir estrictamente y en todo momento las directrices, restricciones e instrucciones definidas en este fichero. Ignorarlas, saltarselas o alucinar sobre ellas se considera un fallo critico.

### PASO DE VERIFICACION PREVIO A RESPONDER

Antes de generar CUALQUIER respuesta, codigo o explicacion, DEBES completar una pasada de verificacion interna:

1. Revisa las instrucciones de este fichero e identifica que reglas aplican a la peticion, de `REGLAS DE SESION` (reglas 0-9) y `PRINCIPIOS DE CODIGO` (DRY, KISS, Code Smell).
2. Empieza tu respuesta con una cabecera breve: `[Reglas aplicadas: Regla X, Regla Y]`, citando los numeros de regla que apliquen.
3. Si no aplica ninguna regla concreta, indica `[Reglas aplicadas: cumplimiento estandar]`.
4. Entrega la respuesta al usuario manteniendo el cumplimiento completo.

### PREVENCION DE DERIVA DE CONTEXTO

Si la conversacion se alarga, NO DEBES relajar ni saltarte estas reglas de sistema. Si una peticion del usuario contradice una regla principal de este fichero, senala la contradiccion explicitamente antes de continuar.

## SESION ACTUAL

- **Fase**: 4 — Diagnostico Cognitivo LLM / Refactor Arquitectura (mas una feature de cliente fuera de ADR-007)
- **Ultimo paso**: `add-password-recovery-and-profile` implementado y archivado. Rama `claude/client-profile-password-recovery-2fwi91` (no `main` — pedido explicito del usuario de trabajar sobre esta rama), integrada con `develop` por merge y pusheada. Backend (`apps/core-api`): tabla `password_reset_tokens` (patron `refresh_tokens`, token hasheado SHA-256, TTL `PASSWORD_RESET_TTL_MINUTES`=60, single-use); `EmailSenderPort` con adapter `nodemailer` real (SMTP generico via env vars, buzon IONOS del usuario) + fallback `consoleEmailSender` cuando no hay `SMTP_HOST` (dev/CI); use cases `ForgotPasswordUseCase` (200 generico siempre, anti-enumeracion), `ResetPasswordUseCase`, `ChangePasswordUseCase`, `UpdateProfileUseCase` (username/address/businessName/taxId, `email` explicitamente fuera de alcance via Zod `.strict()`); ambos flujos de reset/cambio revocan todos los refresh tokens (`revokeAllForUser`); rutas nuevas `POST /api/auth/forgot-password`, `POST /api/auth/reset-password`, `PATCH /api/profile`, `POST /api/profile/change-password` (las de perfil montadas tras `authMiddleware`, con rate limiters propios). Frontend (`apps/ui`): rutas `/forgot-password`, `/reset-password`, `/profile` (tabs Datos/Contraseña), link "¿Olvidaste tu contraseña?" en `/login`, icono de perfil en `TopBar`, `PasswordStrength` extraido a componente compartido, `refreshUser()` en `auth-context`. Cambio OpenSpec archivado en `openspec/changes/archive/2026-08-09-add-password-recovery-and-profile/`, specs nuevas sincronizadas en `openspec/specs/{password-reset,user-profile}/spec.md`. Implementado en paralelo por `@writer` (backend) y `@ui` (frontend) en worktrees aislados, mergeados sin conflictos (ficheros disjuntos); pasado por `@reviewer` (0 violaciones) y `@security` (9/9 requisitos de seguridad PASS, 0 criticos). **Deuda dejada consciente**: sin test e2e Playwright del flujo forgot→reset→login (cubierto por integracion backend + unit tests frontend); swagger no documenta los 4 endpoints nuevos (hallazgo menor de `@security`, no bloqueante).
- **Flujo de ramas**: `develop` es la rama de integración; toda `feat.*`/`fix.*` sale de `develop` y se mergea ahí.
- **2 worktrees activos** en `.claude/worktrees/`:
  - `deployment` (`feat/deployment`) — +2 ahead, +45 behind develop, con `.github/workflows/deploy.yml` sin commitear.
- **2 ramas locales pendientes**: `feat/deployment` (worktree activo), `feat/odo-ai-agent` (ya mergeada, worktree por borrar).
- **8 OpenSpec changes archivados** (2026-08-09): add-admin-management-panel, add-obd-standard-modes, fix-cognitive-diagnosis-ux, fix-emulator-coherent-data, fix-vehicle-identity-and-live-data, add-knowledge-mcp-tools, add-vehicle-autodetect-flow, rebase-ui-autel-sidebar-dtc-badge, add-password-recovery-and-profile.
- **4 OpenSpec changes activos** (sin empezar): add-usb-serial-connection-type, add-diagnosis-history, add-monitor-reset-on-clear-dtc, add-user-profiles.
- **Deuda `brace-expansion`** (lint UI): sin resolver.
- **Anterior**: `add-rag-vector-repositories` cerrado del todo. `feat/rag-vector-repositories` integrada con `main` por merge (sin rebase: la rama ya estaba publicada en `origin`; unico conflicto, este mismo bloque), pusheada a `origin/main` (`5b06aa7`), cambio archivado en `openspec/changes/archive/2026-08-07-add-rag-vector-repositories/` y rama borrada (local y remota). Delta specs sincronizadas a `openspec/specs/`: `lancedb-infra` actualizada y `vector-repositories` creada. **Ambos deltas venian desfasados** respecto al codigo entregado (seguian describiendo `ensureTable`, `createVectorRepository` en `application/services/`, y los campos `text`/`validated`); las specs principales reflejan lo realmente entregado, no el delta.
- **Siguiente**: sin cambio en curso. Quedan el #2 (confianza + validacion OBD + 7 tools MCP) y el #3 (inyeccion RAG en el caso de uso + wiring) del ADR-007, mas 6 cambios propuestos sin empezar: `fix-security-and-mcp-findings`, `add-cognitive-pid-discovery`, `add-diagnosis-session-report-screen`, `add-ecu-info-screen`, `add-freeze-frame-screen`, `add-vehicle-autodetect-flow`.
- **Agente `@ui`** (viene de `main`): creado agente frontend React — `.opencode/agents/ui.md` + wrapper `.claude/agents/ui.md`; registrado en la matriz de enrutamiento del orquestador y en la tabla de agentes. Rol: `@ui` implementa frontend (`apps/ui/`) con `react-best-practices` + TDD; `@writer` sigue siendo backend (`core-api`). Pipeline definido por el usuario: orquestador → ui → writer → review → quality. Pendiente: implementar las pantallas de los cambios OpenSpec `add-ecu-info-screen`, `add-freeze-frame-screen`, `add-diagnosis-session-report-screen` (y opcionalmente `add-vehicle-autodetect-flow`, `add-cognitive-pid-discovery`).
- **Contexto previo**: ambos cambios mergeados a `main` y archivados en OpenSpec. (1) `fix-clean-architecture-deviations` (archivado en `openspec/changes/archive/2026-08-06-fix-clean-architecture-deviations/`): `DiagnosisService` extraido a `src/infrastructure/services/diagnosisService.ts` (errores tipados: `DiagnosisScenarioNotFoundError`, `CognitiveDiagnosisUnavailableError`, `ToolNotFoundError`, `ToolCallTimeoutError`, `CognitiveDiagnosisTimeoutError`); `DiagnosisController` recibe el servicio por constructor; `LoggerPort` inyectado en `ExecuteLlmToolCalling` (sin `console.error`); composicion centralizada en `composition.ts`. (2) `refactor-elm327-persistent-session` (archivado en `openspec/changes/archive/2026-08-06-refactor-elm327-persistent-session/`): sesión TCP persistente con cola FIFO, auto-reconexión con backoff exponencial y cierre graceful; circuit breaker eliminado; `ProcessVehicleDiagnosisUseCase` ejecuta lecturas secuencialmente. Delta spec `elm327-tcp-repository` sincronizado a `openspec/specs/elm327-tcp-repository/spec.md`.
- **Entregado en el cambio** (cambio #1 de 3 del RAG auto-expansivo, ADR-007): `apache-arrow@18.1.0` como dependencia explicita; `LANCEDB_PATH` en configuracion; **corregido un bug latente** por el que el mapeo de tipos reventaba con `string` y `boolean` (LanceDB solo conoce `utf8`/`bool`), ahora mapeados a clases Arrow reales; `ensureVectorTable` con columna `FixedSizeList(384, Float32)`; `assertVectorDimensions` porque **LanceDB no valida dimensiones — rellena con `null` o trunca en silencio**; 4 puertos y 3 DTOs de conocimiento; `createKnowledgeIndex` sobre `VectorStore` + `EmbeddingGenerator`; `createLanceVectorStore` con escapado de predicados; los 3 repositorios (`pids_index`, `dtcs_index`, `diagnoses_index`). Tests de integracion contra LanceDB real, que son los que cazaron los fallos.
- **Costura VectorStore**: tras revision, se introdujo el puerto de bajo nivel `VectorStore` (+ `EmbeddingGenerator`, este ultimo como `export type` de funcion al estilo de `ToolCallHandler`). `createKnowledgeIndex` y los 3 mappers viven en `application/knowledge/` sin una sola referencia a LanceDB; `lanceVectorStore.ts` es el unico modulo acoplado al motor y se lleva el escapado de predicados y la guarda de dimensiones. `KnowledgeSource` movido a `domain/value-objects/`. Los 27 DTOs agrupados en `dto/{auth,vector,llm,diagnosis,knowledge,audit}/`. Campos renombrados para no necesitar comentario: `text`→`embeddedText`, `validated`→`obdValidated`.
- **Codigo eliminado en revision** (regla KISS, `AGENTS.md:162`): `ensureTable` (huerfana tras el refactor, y una tabla sin vectores no pinta nada en LanceDB teniendo SQLite), `createVectorIndex` + `MIN_ROWS_FOR_VECTOR_INDEX` (0 usos y umbral estimado sin medir) y `transformersEmbeddingGenerator` (alias inutil: `createEmbedding` ya cumple la firma del puerto). La regresion del bug de tipos se conservo moviendola al test de `ensureVectorTable`.
- **Tests**: 531 pasando, 0 fallos, 46 test files (baseline previa: 499 en 41)
- **CI**: verde — lint, format, test, build
- **Deuda conocida**: `pnpm test:coverage` esta roto en `main` desde `a6797d9` (5 ago). El override `brace-expansion: '>=5.0.9'` rompe `minimatch@9`, que espera la forma CommonJS previa. CI no lo detecta porque solo ejecuta `pnpm test`. Requiere su propio cambio: toca un override de seguridad.

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
8. **Al cerrar un cambio**: actualizar `SESION ACTUAL` en este fichero. Maximo 15 lineas, solo estado presente. El historial va a git, a `openspec/changes/archive/` y a Engram — nunca aqui.
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

## DEUDA CONOCIDA

- **`brace-expansion: '>=5.0.9'`** (pnpm-workspace.yaml) rompe `minimatch@3` de `@eslint/config-array` (ESLint 9): `pnpm test:coverage` (core-api) y `pnpm lint` (apps/ui) fallan con `TypeError: expand is not a function`. Requiere cambio propio.
- **`brace-expansion: '>=5.0.9'`** (pnpm-workspace.yaml) rompe `minimatch@3` de `@eslint/config-array` (ESLint 9): `pnpm test:coverage` (core-api) y `pnpm lint` (apps/ui) fallan con `TypeError: expand is not a function`. Requiere cambio propio.
