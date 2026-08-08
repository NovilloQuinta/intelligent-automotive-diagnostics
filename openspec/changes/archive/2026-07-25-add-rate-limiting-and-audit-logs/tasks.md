## 1. Setup

- [x] 1.1 Instalar `express-rate-limit` y `@types/express-rate-limit`
- [x] 1.2 Anadir tabla `audit_logs` a `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts`

## 2. Audit Log Repository (TDD)

- [x] 2.1 RED: Escribir `auditLogRepository.test.ts` con tests para `create` y `findRecent`
- [x] 2.2 GREEN: Implementar `SqliteAuditLogRepository` con metodo `create`
- [x] 2.3 REFACTOR: Revisar coverage, limpiar magic numbers, verificar TSDoc

## 3. Audit Logger Middleware (TDD)

- [x] 3.1 RED: Escribir `auditLogger.test.ts` verificando que `create` se llama tras el response
- [x] 3.2 GREEN: Implementar `createAuditLogger` como factory function (Express middleware)
- [x] 3.3 REFACTOR: Extraer constantes, verificar fire-and-forget, coverage

## 4. Rate Limiter Middleware (TDD)

- [x] 4.1 RED: Escribir `rateLimiter.test.ts` verificando 429 al exceder limite
- [x] 4.2 GREEN: Implementar `createRateLimiter` como factory function (envuelve `express-rate-limit`)
- [x] 4.3 REFACTOR: Extraer defaults a constantes, verificar headers, coverage

## 5. Integracion

- [x] 5.1 Extender `ServerConfig` con opciones de rate limiting y audit logger
- [x] 5.2 Inyectar ambos middlewares en `createServer` (server.ts)
- [x] 5.3 Ejecutar suite completa: `pnpm format && pnpm lint && pnpm test && pnpm test:coverage && pnpm coverage:core`
- [x] 5.4 Actualizar CLAUDE.md con estado D5
