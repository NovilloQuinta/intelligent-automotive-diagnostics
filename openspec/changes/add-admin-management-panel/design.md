## Contexto

Este documento recoge las decisiones que no son obvias al añadir un rol de administrador y exponer datos que hoy solo existen en el disco.

## Decisión 1: el rol no viaja en el JWT

El access token solo lleva `sub` (el `userId`). `requireAdmin` no decodifica un claim de rol: llama a `userRepo.findById(req.userId)` y comprueba `user.isAdmin`.

**Por qué.** El access token vive 15 minutos, pero revocar un rol debe surtir efecto de inmediato, no al expirar el token. Meter el rol en el JWT obligaría a invalidar tokens activos cada vez que se promueve o degrada un admin — justo el problema que los JWT sin estado no saben resolver bien. Una consulta más por request a una tabla indexada por PK es una compra barata a cambio de esa garantía.

**Coste aceptado.** Una query SQL extra en cada petición a `/api/admin/*`. Es aceptable: esas rutas no son de alto volumen ni están en el camino crítico del diagnóstico.

## Decisión 2: el seed de admin es idempotente y vive en el composition root

`buildApp` comprueba si existe un usuario con `ADMIN_EMAIL`; si no existe, lo crea con `ADMIN_PASSWORD` hasheada reusando `AuthService` (mismo `bcrypt`/coste que el registro normal, para no introducir un segundo camino de hashing). Si ya existe, no hace nada — ni siquiera resetea la contraseña, para no pisar una que el admin ya cambió a mano.

**Por qué.** No hay pantalla de "promover a admin" en el alcance de este cambio (ver Fuera de alcance en `proposal.md` — no la pidió el usuario). Sin un seed, no habría ninguna forma de tener el primer admin salvo escribir SQL a mano.

**Riesgo aceptado y su mitigación.** Si `ADMIN_EMAIL`/`ADMIN_PASSWORD` no están definidas, el seed simplemente no corre y se registra un `logger.warn` — no se lanza excepción que tumbe el arranque. Nunca se loguea la contraseña.

## Decisión 3: DTO de filtro compartido, discriminado por consumidor

`logs`, `audit_logs` y `users` comparten paginación (`page`, `pageSize` con tope 100) y rango de fechas (`from`, `to`) y búsqueda de texto (`q`), pero cada uno tiene columnas propias de filtro: `level` en logs; `statusCode`, `path`, `userId` en auditoría; nada adicional en usuarios más allá de `q` sobre email/username.

Se define un DTO base (`AdminListFilter`) con los campos comunes validados con Zod, y cada endpoint extiende ese esquema con sus campos propios (`AdminLogsFilter`, `AdminAuditFilter`, `AdminUsersFilter`). El tope de `pageSize` en 100 se aplica en el esquema Zod, no en el repositorio — así ningún caso de uso puede saltárselo por error.

**Por qué no un DTO único con todos los campos opcionales.** Un solo tipo con `level?`, `statusCode?`, `path?`, `userId?` todos opcionales no dice nada sobre qué combinación tiene sentido en cada endpoint, y el tipo no ayudaría a detectar en compilación un `statusCode` colado en el filtro de usuarios.

## Decisión 4: el catálogo vectorial se resume, no se re-indexa para el panel

`VectorStore.count()` devuelve el número de filas de la tabla; `VectorStore.sample(limit)` devuelve hasta `limit` filas sin ordenar por relevancia (no es una búsqueda semántica, es "dame unas cuantas para ver qué hay"). `POST /api/admin/knowledge/search` sí usa el `query()` ya existente del puerto, para poder probar qué devolvería el RAG con un texto dado.

**Por qué separar `sample` de `search`.** Un operador quiere dos cosas distintas: "¿cuántas entradas de motocicleta tengo y cómo son unas cuantas al azar?" (barato, sin embeddings) y "si busco esta avería, ¿qué me devuelve el sistema?" (cuesta un embedding y una consulta vectorial real). Forzar todo por `query()` obligaría a generar un embedding solo para listar filas.

**Coste aceptado.** LanceDB no tiene un `COUNT(*)` trivial en todas las versiones de la librería; `count()` puede necesitar `table.countRows()` o un `toArray().length` según lo que exponga el SDK instalado — se decide en implementación, no aquí, pero el contrato del puerto no cambia si la librería lo soporta de forma nativa.

## Decisión 5: el overview deriva volumen de consultas de `audit_logs`, con esa limitación visible

`GetAdminOverviewUseCase` agrupa `audit_logs` por `path` (ej. cuántas peticiones a `/api/diagnosis`, `/api/mcp/cognitive-diagnosis`) como proxy de actividad, porque no existe todavía una tabla de diagnósticos ni de llamadas al LLM persistidas (`add-diagnosis-history` está descartado en su forma actual; su sucesor, `add-user-query-telemetry`, no existe aún).

**Por qué no esperar a esa tabla.** El panel de administración tiene valor propio — logs, auditoría, usuarios, catálogo — sin depender de una feature de historial que vive en otro change con otro alcance. Bloquear este cambio a que exista `llm_queries` retrasa algo que ya se puede construir hoy.

**Cómo se comunica la limitación.** La UI (`OverviewCards`) etiqueta esa métrica explícitamente como "peticiones HTTP a endpoints de diagnóstico", no como "diagnósticos realizados" — para no sugerir una precisión que los datos no tienen. Cuando exista la tabla real, `GetAdminOverviewUseCase` cambia su fuente sin tocar el contrato del endpoint `/api/admin/overview`.

## Decisión 6: `admin.middleware.ts` es un middleware más, no un guard embebido en el controlador

`createRequireAdmin(userRepo)` sigue exactamente el patrón de `createAuthMiddleware`/`createAuditLogger`: una factory que recibe sus dependencias y devuelve un `RequestHandler`. Se monta en `admin.routes.ts` después de `authMiddleware` (que ya puso `req.userId`), nunca antes.

**Por qué.** Es el mismo patrón de middleware factory que ya usa el proyecto (`auth.middleware.ts`, `audit-logger.middleware.ts`, `rate-limiter.middleware.ts`). Duplicar la comprobación de rol dentro de cada método del controlador sería fácil de olvidar en un endpoint nuevo; como middleware de ruta, aplica a todo `/api/admin/*` de una vez.

## Decisión 7: paginación y filtros se resuelven en SQL/LanceDB, nunca en memoria

Igual que en `add-diagnosis-history`, `list()`/`stats()` de `LogRepository`, `AuditLogRepository` y `UserRepository` filtran con `WHERE`/`LIMIT`/`OFFSET` en la consulta, no traen todo y filtran en JS. La UI nunca pagina en el navegador.

**Por qué.** `logs` puede crecer a razón de una fila por línea de log de cualquier nivel — sin límite en SQL esa tabla se convierte en el cuello de botella del panel en cuanto la app lleve unas semanas corriendo.

## Riesgos

- **Migración de `users.role`**: SQLite soporta `ALTER TABLE ADD COLUMN` con `DEFAULT` sin reescribir la tabla; verificar que Drizzle genera esa migración y no un `CREATE TABLE`+`COPY` que pueda fallar con datos existentes.
- **`count()` de LanceDB**: si la versión instalada del SDK no expone un conteo eficiente, puede degradar a leer toda la tabla; medir con las tablas reales (`pids_index`, `dtcs_index`, `diagnoses_index`) y, si pesa, cachear el conteo con TTL corto en el caso de uso — decisión de implementación, no de contrato.
- **Volumen de `logs`**: como escribe cada línea de log incluyendo `debug`, el listado sin filtro de fecha puede ser enorme desde el primer día; el filtro de fecha por defecto en la UI debe acotar a un rango razonable (p. ej. últimas 24h) en vez de pedir todo.
