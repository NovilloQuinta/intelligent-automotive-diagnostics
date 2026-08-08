## 1. Setup

- [x] 1.1 Instalar supertest como devDependency
- [x] 1.2 Crear `SqliteRefreshTokenStore` en `infrastructure/persistence/sqlite/refreshTokenStore.ts`
- [x] 1.3 Extender `ServerConfig` con `userRepo`, `authService`, `tokenStore`

## 2. Auth Controller (TDD)

- [x] 2.1 RED: Escribir `authController.test.ts` (~12 tests: register individual/workshop/duplicate/invalid, login ok/wrong/unknown, refresh ok/invalid/revoked/expired)
- [x] 2.2 GREEN: Implementar `createAuthController` con Zod schemas y handlers
- [x] 2.3 REFACTOR: Extraer constantes, verificar TSDoc, coverage

## 3. Auth Middleware (TDD)

- [x] 3.1 RED: Escribir `authMiddleware.test.ts` (~5 tests: 401 sin token, 401 invalido, 401 expirado, next con token valido, req.userId seteado)
- [x] 3.2 GREEN: Implementar `createAuthMiddleware` con Express type augmentation
- [x] 3.3 REFACTOR: Verificar TSDoc, coverage

## 4. Routes + Server Integration

- [x] 4.1 Crear `authRoutes.ts` (Express Router con /register, /login, /refresh)
- [x] 4.2 Montar rutas auth + middleware authenticateToken en `server.ts`
- [x] 4.3 Inyectar dependencias (DB, repos, authService) en `main.ts`

## 5. Integration Tests

- [x] 5.1 RED: Escribir `auth.integration.test.ts` (~8 tests con supertest: pipeline completo)
- [x] 5.2 GREEN: Verificar que pasan (deberian pasar si steps 2-4 estan bien)

## 6. Docker + docker-compose

- [x] 6.1 Crear `apps/core-api/Dockerfile` (Node 20 + pnpm + build + start)
- [x] 6.2 Actualizar `docker-compose.yml` (servicio api + volumen SQLite)

## 7. Suite completa

- [x] 7.1 Ejecutar `pnpm format && pnpm lint && pnpm test && pnpm test:coverage && pnpm coverage:core`
- [x] 7.2 Actualizar CLAUDE.md con estado D6
