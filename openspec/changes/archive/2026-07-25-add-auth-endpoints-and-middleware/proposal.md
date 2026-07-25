## Why

La API expone endpoints de diagnostico vehicular (`/api/diagnosis`, `/api/scenarios`, `/api/mcp/tools/*`) sin autenticacion. Cualquier cliente puede acceder a ellos. Necesitamos un sistema de registro/login con JWT para particulares y talleres, protegiendo todos los endpoints de diagnostico tras un middleware de autenticacion.

## What Changes

- **Endpoints de auth**: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh` con validacion Zod, hashing bcrypt y tokens JWT.
- **Middleware de autenticacion**: `authenticateToken` que verifica el JWT del header `Authorization: Bearer <token>`. Si falta o es invalido → 401.
- **Proteccion de rutas existentes**: `/api/scenarios`, `/api/diagnosis`, `/api/mcp/tools/*` pasan a requerir token JWT valido.
- **Refresh token store**: Implementacion SQLite del `RefreshTokenStore` definido en `authService.ts` para persistir y rotar refresh tokens.
- **Dockerfile**: La API se dockeriza (Node 20 + pnpm) para despliegue.
- **Integracion E2E**: Tests con supertest que validan el pipeline completo (auth → proteccion → rate limit → audit log).

## Capabilities

### New Capabilities
- `auth-endpoints`: Registro de usuarios (individual/workshop), login con JWT, refresh de tokens. Validacion de entrada con Zod.
- `auth-middleware`: Middleware Express que protege rutas verificando el JWT del header Authorization.
- `api-dockerization`: Dockerfile para construir y ejecutar la API en un contenedor Node 20.

### Modified Capabilities
<!-- Ninguno — no se modifican specs existentes -->

## Impact

- Nuevo: `apps/core-api/src/application/auth/authController.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/middleware/authMiddleware.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/routes/authRoutes.ts`
- Nuevo: `apps/core-api/src/infrastructure/persistence/sqlite/refreshTokenStore.ts`
- Nuevo: `apps/core-api/Dockerfile`
- Nuevo: `apps/core-api/tests/unit/application/auth/authController.test.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/http/middleware/authMiddleware.test.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/refreshTokenStore.test.ts`
- Nuevo: `apps/core-api/tests/integration/auth.integration.test.ts`
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (rutas auth + middleware)
- Modificado: `apps/core-api/src/main.ts` (inyectar DB, repos, authService)
- Modificado: `docker-compose.yml` (servicio api)
- Modificado: `apps/core-api/package.json` (supertest)
