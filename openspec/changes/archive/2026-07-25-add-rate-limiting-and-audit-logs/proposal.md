## Why

La API actual no tiene proteccion contra abuso (A04 OWASP) ni trazabilidad de operaciones (A09 OWASP). Un atacante puede saturar endpoints sin restriccion alguna y no hay registro historico de quien hizo que, dificultando auditorias de seguridad y forense post-incidente.

## What Changes

- **Rate limiting global**: middleware `express-rate-limit` con 100 req/15min por IP, con headers estandar `RateLimit-*` y respuesta 429.
- **Audit logs**: tabla `audit_logs` en SQLite via Drizzle, repositorio para grabar eventos, y middleware que registra cada request HTTP (metodo, ruta, status, timestamp, IP).
- **Integracion en server.ts**: ambos middlewares se inyectan en el pipeline de Express tras helmet.

## Capabilities

### New Capabilities
- `rate-limiting`: Limitar peticiones por IP con `express-rate-limit`, configurable (ventana, max requests), headers estandar, respuesta 429.
- `audit-logging`: Registro estructurado de requests HTTP en tabla `audit_logs` con middleware automatico y repositorio para consultas.

### Modified Capabilities
<!-- Sin cambios en specs existentes -->

## Impact

- Nuevo archivo: `apps/core-api/src/infrastructure/http/middleware/rateLimiter.ts`
- Nuevo archivo: `apps/core-api/src/infrastructure/http/middleware/auditLogger.ts`
- Nuevo archivo: `apps/core-api/src/infrastructure/persistence/sqlite/auditLogRepository.ts`
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (tabla `audit_logs`)
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (inyectar middlewares)
- Modificado: `apps/core-api/package.json` (`express-rate-limit`, `@types/express-rate-limit`)
- Nuevos tests: 2 archivos (rate limiter + audit logger)
