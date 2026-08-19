# Intelligent Automotive Diagnostics - TFM

> Vehicular telemetry simulation & AI-powered diagnosis using MCP.
> Master IA - Jesus Novillo | Demo: semana del 10 de agosto 2026 (web publicada + coche real por cable)

Este fichero contiene **solo reglas operativas estables**. Lo cargan todos los
agentes, asi que se mantiene corto a proposito. El estado volatil y los
protocolos largos viven fuera:

| Necesitas | Lee |
|---|---|
| Estado de la sesion, worktrees, changes activos | `docs/estado-actual.md` |
| Deuda tecnica conocida | `docs/deuda-conocida.md` |
| Protocolo de pipeline con review gates | `docs/pipeline-multi-paso.md` |
| Detalle de que guardar en Engram | `docs/engram.md` |

## MANDATO OPERATIVO PRINCIPAL

DEBES seguir estrictamente las directrices de este fichero. Ignorarlas o
alucinar sobre ellas se considera un fallo critico.

Si una peticion del usuario contradice una regla de este fichero, senala la
contradiccion explicitamente antes de continuar. Si la conversacion se alarga,
NO relajes estas reglas.

### Cabecera de reglas aplicadas

En tareas que **tocan codigo, specs o configuracion**, empieza la respuesta con
`[Reglas aplicadas: Regla X, Regla Y]`. En preguntas, exploracion y respuestas
conversacionales no hace falta: la cabecera es para dejar traza de decisiones,
no un peaje por mensaje.

## REGLAS DE SESION

0. **Guardar en Engram** — tras cada accion no trivial (bugfix, decision de diseno, descubrimiento, nuevo patron), llama a `mem_save` INMEDIATAMENTE. No esperes al cierre de sesion. Si tienes duda, guarda. Detalle en `docs/engram.md`.
1. **Orquestar segun el tamano de la tarea** — `@orchestrator` cuesta un arranque de agente en frio (~8.5k tokens) para devolver un JSON de enrutamiento. Usalo cuando aporte:
   - **Obligatorio**: cambios multi-modulo, cualquier trabajo en modo pipeline, o cuando no tengas claro que agente/skill toca.
   - **Opcional (saltatelo)**: tareas de 1-2 ficheros donde el agente y la skill son evidentes, correcciones de un test que falla, docs, chore y style. En estos casos delega directo al agente correcto y di en una linea por que te lo saltas.
   - **Changes OpenSpec: se orquesta UNA VEZ por change, no por tarea.** Al abrir el change, `@orchestrator` emite el enrutamiento y ese JSON queda vigente para todas las tareas del `tasks.md`. Las tareas siguientes se delegan directo al agente ya enrutado. Solo se vuelve a orquestar si cambia la naturaleza del trabajo: salto de backend a `apps/ui/` (`@writer` → `@ui`), una tarea que exige rediseno de spec (`@architect`), o una auditoria de seguridad (`@security`). Re-enrutar tarea a tarea paga ~8.5k tokens por redescubrir una decision que ya estaba tomada.
   - Si lo invocas y no emite JSON estructurado, es un bug — no continues sin enrutamiento explicito.
2. **Descubrir antes de crear** — carga skills con la tool `Skill` (por nombre, NO leas el SKILL.md con `Read`), busca en Engram (`mem_search`), revisa el codebase. Prohibido reescribir logica que ya exista.
3. **1 paso a la vez** — no mezclar responsabilidades, no adelantar trabajo
4. **TDD estricto**: RED (test que falla) → GREEN (codigo minimo) → REFACTOR. Durante el ciclo corre SOLO el test en curso (`npx vitest run <fichero>`), nunca la suite entera.
5. **Trabajar en ramas; `develop` es la rama de integración** — cada cambio en su rama (`git checkout -b feat/xxx` o `fix/xxx`), **siempre desde `develop`**. Solo merge a `develop` cuando CI pase verde. Cambios menores (docs, chore, style) directo a `develop`. `main` queda reservada para releases: no se mergea a `main` salvo petición explicita de release.
5b. **Verificar ruta del worktree antes de escribir** — si trabajas en un worktree (`.claude/worktrees/xxx/`), TODO agente y toda operacion `Write`/`Edit` DEBE usar la ruta del worktree, NUNCA la del repo principal. Antes de escribir un archivo, confirma que el path contiene `.claude/worktrees/`. Si un agente escribe en el repo principal estando en un worktree, es un fallo critico.
6. **Checks pre-push**: `pnpm verify` (lint + format + test + build de core-api y ui). No encadenes los scripts a mano: `pnpm test` solo cubre core-api.
7. **Preguntar antes de commitear/pushear** — mostrar resumen de cambios, esperar OK humano
7b. **Los commits son del autor humano, no del agente** — el autor y el committer son
    siempre `Jesús Ángel Novillo Lucas-Vaquero <jesusangelquintanar@gmail.com>`. **Prohibido**
    anadir al mensaje `Co-Authored-By: Claude`, `Claude-Session:`, `Generated with [Claude Code]`
    o cualquier enlace a `claude.ai/code`. Si el entorno trae `user.name` puesto a `Claude`,
    corrigelo con `git config user.name/user.email` antes del primer commit.
7c. **Mensajes de commit cortos** — asunto de una linea en formato convencional
    (`tipo(ambito): que cambia`), max ~72 caracteres. Cuerpo solo si el *por que* no cabe en
    el asunto, y como mucho dos o tres lineas. El detalle largo va al change de OpenSpec o a
    `docs/`, no al historial de git.
8. **Al cerrar un cambio**: actualizar `docs/estado-actual.md`. Maximo 15 lineas, solo estado presente. El historial va a git, a `openspec/changes/archive/` y a Engram — nunca ahi.
9. **Auto-auditoria post-tarea** — al terminar una tarea no trivial: skills usadas, agentes delegados, codigo nuevo estrictamente necesario.

## ECONOMIA DE CONTEXTO

Cada sub-agente arranca **en frio**: no hereda la conversacion y vuelve a pagar
este fichero + sus skills + su definicion (~8.5k tokens) antes de leer una linea
de codigo. Reglas que se derivan de eso:

- **Pasa los ficheros ya leidos en el payload del handoff** (rutas + rangos de
  lineas tocados). Un agente que recibe "revisa `foo.ts:120-180`" no relee el modulo entero.
- **No leas ficheros enteros para cambios puntuales** — usa `Grep`/`Glob` para
  localizar y lee solo el rango. Los modulos grandes (`diagnosisService.ts`,
  `mcpServer.ts`, `api.ts`) mas su test rondan los 20k tokens por lectura.
- **La suite entera solo en el pre-push.** Durante el ciclo, un fichero de test.
- **No leas los SKILL.md con `Read`** — invocalos con la tool `Skill`.
- **OpenSpec**: no releas los cuatro artifacts de un change en cada sub-agente.
  Un change activo ronda los 15k tokens. Pasa el extracto relevante en el payload.

## AGENTES DISPONIBLES

Invoca con `@nombre` o via Task tool. Fuente en `.opencode/agents/`, adaptados en `.claude/agents/`.

| Agente | Modelo | Rol |
|---|---|---|
| `@orchestrator` | sonnet | Enruta tareas al sub-agente y skill correctos. Salida JSON estructurada. |
| `@writer` | sonnet | Implementa codigo (backend/core-api) con TDD + Clean Architecture + Zod |
| `@ui` | sonnet | Implementa pantallas/componentes React en apps/ui/ con TDD + react-best-practices |
| `@architect` | sonnet | Disena specs OpenSpec, propone cambios, mantiene coherencia entre artifacts |
| `@reviewer` | haiku | Revisa TypeScript, TSDoc, Clean Architecture, DRY, KISS, code smells (read-only) |
| `@quality` | haiku | Ejecuta lint + test + coverage + audit y reporta |
| `@security` | haiku | Audita reglas OWASP: CORS, helmet, JWT, rate-limit, Zod (read-only) |

## SKILLS

Invocalas por nombre con la tool `Skill`. Fuente unica en `.opencode/skills/`
(`.claude/skills/` son symlinks a esa fuente).

| Skill | Cuando cargar |
|---|---|
| `clean-architecture` | Antes de crear/mover ficheros entre capas |
| `typescript-best-practices` | Al escribir o revisar TypeScript |
| `tdd-workflow` | Antes de escribir tests o ciclo Red-Green-Refactor |
| `react-best-practices` | Al tocar componentes o hooks en `apps/ui/` |
| `tsdoc-jsdoc-documentation` | Antes de crear o revisar TSDoc en exports publicos |
| `coverage-strategy` | Al configurar thresholds, revisar coverage, o decidir que testear |
| `dev-workflow` | Al iniciar un desarrollo nuevo y al mergear a develop |
| `openspec-propose` | Al proponer un cambio nuevo (design + specs + tasks) |
| `openspec-apply-change` | Al implementar tareas de un cambio OpenSpec |
| `openspec-archive-change` | Al archivar un cambio completado |
| `openspec-explore` | Modo exploracion — pensar sin implementar |
| `openspec-update-change` | Al actualizar artifacts de un cambio existente |
| `openspec-sync-specs` | Al sincronizar delta specs con main specs |

## PRINCIPIOS DE CODIGO

`@reviewer` evalua estos principios en cada revision:

- **DRY** — Sin duplicacion de logica no trivial. Si un patron se repite 3+ veces, extraer a funcion/utilidad compartida. Excepcion: tests.
- **KISS** — La solucion mas simple posible. Sin abstracciones prematuras, sin factory de factories. Una funcion = una responsabilidad clara.
- **Code Smell** — Funciones >40 lineas, parametros >4, anidamiento >3 niveles, comentarios explicando QUE hace el codigo, magic strings/numbers sin nombre, imports no usados.

### Excepciones al limite de 40 lineas

El limite lo aplica ESLint (`max-lines-per-function`, warn). Hay funciones que
legitimamente no bajan de 40 lineas: las **declarativas**, que no son logica sino
una lista plana de datos o de llamadas de registro (`registerDiagnosticTools`,
`registerKnowledgeTools`). Partirlas no mejora nada — solo reparte una lista en
dos sitios.

Una funcion larga es excepcion legitima si cumple **las dos**:

1. **No dispara warning de `complexity`** (limite 5). Es la senal objetiva: una
   lista declarativa tiene complejidad 1; si ademas ramifica, es logica larga.
2. **El cuerpo es una lista plana** de llamadas o de datos, sin ramificacion ni
   estado intermedio.

Se marca con el disable de ESLint **y su razon**, en la linea justo anterior a
la declaracion:

```ts
// eslint-disable-next-line max-lines-per-function -- lista declarativa de registro
export function registerDiagnosticTools(...) {
```

**El marcador NO sirve para acallar deuda.** Una funcion larga que ADEMAS dispara
`complexity` es deuda, no excepcion: se deja avisando o se parte. Ejemplo actual:
`createMcpServer` (46 lineas) no lleva disable a proposito — contiene el closure
`registerTool`, que es logica.

`@reviewer` y GGA leen este fichero: una funcion larga **con** disable razonado
no se reporta; **sin** el, si.

## Scripts

```bash
# Verificacion (raiz)
pnpm verify                             # gate pre-push completo (core-api + ui)
pnpm test:all                           # tests de core-api + ui
pnpm test:coverage                      # coverage core-api
pnpm test:coverage:ui                   # coverage ui
VITEST_VERBOSE=1 pnpm test              # arbol de tests + logs (solo para depurar)

# OBD (raiz)
pnpm tsx scripts/send-obd.ts "01 0C"    # enviar comando OBD al emulador
pnpm tsx scripts/scan-pids.ts           # escanear PIDs soportados

# DB (apps/core-api)
pnpm drizzle-kit generate               # generar migraciones desde schema.ts
pnpm drizzle-kit migrate                # aplicar migraciones a SQLite
```
