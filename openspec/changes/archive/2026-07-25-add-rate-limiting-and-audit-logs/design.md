## Context

API Express 5 actual sin proteccion contra abuso ni trazabilidad. Stack: TypeScript, Express 5, Drizzle ORM + SQLite, factory functions, TDD con Vitest. Proyecto TFM con Clean Architecture + MCP.

## Goals / Non-Goals

**Goals:**
- Limitar peticiones por IP usando `express-rate-limit` (configurable via `ServerConfig`)
- Registrar cada request HTTP en tabla `audit_logs` con middleware automatico
- Ambos middlewares como factory functions, inyectables via `createServer`
- Cada middleware con tests unitarios completos (TDD)

**Non-Goals:**
- Rate limiting por usuario autenticado (no hay auth integrada aun en pipeline)
- Rotacion o purgado automatico de `audit_logs`
- Logging de eventos de aplicacion (solo HTTP middleware)
- Rate limiting diferenciado por endpoint

## Decisions

### 1. `express-rate-limit` vs implementacion propia
**Elegido**: `express-rate-limit`. Es la libreria estandar de Express (3k+ stars, mantenida), soporta headers `RateLimit-*`, store en memoria por defecto. Implementar rate limiting propio seria reinventar la rueda y fuente de bugs de concurrencia.

### 2. Almacenamiento del rate limit: memoria vs SQLite
**Elegido**: Memoria (default de `express-rate-limit`). Para rate limiting, la memoria es suficiente y rapida. SQLite anadiria latencia de disco en cada request. Si necesitamos persistencia entre reinicios en el futuro, la libreria soporta stores custom (Redis, etc.).

### 3. Tabla `audit_logs`: esquema y columnas
**Elegido**: Columnas minimales: `id`, `method`, `path`, `statusCode`, `ip`, `userAgent`, `durationMs`, `createdAt`. Sin foreign key a `users` (el middleware corre antes de auth y no siempre hay usuario autenticado). En el futuro se puede anadir `userId` nullable.

### 4. Middleware de audit: registro sincrono vs asincrono
**Elegido**: Asincrono con fire-and-forget (no bloquea la respuesta). El middleware captura el timestamp de inicio, escucha el evento `finish` de `res`, y escribe en BD sin `await`. Si falla el write, se loguea a consola pero no rompe el request. Esto evita que el audit logging degrade la latencia de la API.

### 5. Tests: enfoque TDD
**Elegido**: RED-GREEN-REFACTOR estricto. Rate limiter se testea con `express-rate-limit` mockeado parcialmente (verificar que devuelve 429). Audit logger se testea con mock del repositorio, verificando que `create` se llama con los datos correctos tras el `finish` del response.

## Risks / Trade-offs

- [Fire-and-forget en audit logger] → Si el proceso muere entre el `finish` y el `write`, se pierde el log. Mitigacion: aceptable para un TFM; en produccion se usaria cola de mensajes.
- [Rate limit en memoria] → Se pierde al reiniciar el proceso. Mitigacion: aceptable; 100 req/15min es generoso y los contadores se regeneran rapido.
- [express-rate-limit v7+] → Compatibilidad con Express 5 verificada en docs oficiales.
