## Context

API Express 5 con Clean Architecture. Ya existe `UserRepository` (SQLite), `AuthService` (bcrypt + JWT con 5 funciones), y `RefreshTokenStore` como interfaz en `authService.ts`. Los endpoints de diagnostico (`/api/diagnosis`, `/api/scenarios`, `/api/mcp/tools/*`) estan montados sin proteccion. Se necesita registro/login de usuarios y proteccion JWT.

## Goals / Non-Goals

**Goals:**
- Endpoints REST para registro y login con validacion Zod
- Middleware que protege rutas de diagnostico verificando JWT
- Refresh token rotation (ya implementado en authService, se usa aqui)
- Dockerizar la API para despliegue operativo
- Tests de integracion que validen el pipeline completo

**Non-Goals:**
- Role-based access control (admin vs user)
- Email verification o password reset
- OAuth/social login
- UI (solo API)

## Decisions

### 1. AuthController: factory function con dependencias inyectadas
**Elegido**: `createAuthController({ userRepo, authService, tokenStore })` devuelve `{ register, login, refresh }`. Mismo patron que `createDiagnosisController` y `createServer`. Cada handler recibe Express `(req, res, next)` y valida `req.body` con Zod.

### 2. Schemas Zod en el mismo fichero del controller
**Elegido**: KISS. Son 3 schemas pequenos (register, login, refresh). No justifican fichero separado. Si crecen, se extraen despues.

### 3. SqliteRefreshTokenStore
**Elegido**: Clase que implementa `RefreshTokenStore` de `authService.ts`. Usa la tabla `refresh_tokens` del schema Drizzle. Metodos: `saveRefreshToken`, `findRefreshToken`, `revokeRefreshToken`. Se inyecta en `authService` y en el controller para `refreshAccessToken`.

### 4. AuthMiddleware: validacion del JWT sin acceso a BD
**Elegido**: El middleware solo llama a `authService.verifyAccessToken(token)`. No consulta BD. Si el token es valido → `req.userId = userId`, `next()`. Si no → 401. La logica de refresh/revocacion va en `/api/auth/refresh`, no en el middleware.

### 5. Express type augmentation para req.userId
**Elegido**: `declare global { namespace Express { interface Request { userId?: number } } }` en `authMiddleware.ts`. Sigue el patron de Express 5 para extender `Request`.

### 6. Rutas auth como Express Router
**Elegido**: `authRoutes.ts` crea un `Router` con `/register`, `/login`, `/refresh`. Se monta en `server.ts` con `app.use('/api/auth', authRoutes)`. Las rutas van ANTES del middleware de auth en el pipeline.

### 7. Pipeline ordenado
```
helmet → rateLimiter → auditLogger → express.json
  → /api/auth/* (PUBLICO)
  → authenticateToken (MIDDLEWARE)
  → /api/scenarios, /api/diagnosis, /api/mcp/tools/* (PROTEGIDO)
```

### 8. Supertest para integracion
**Elegido**: `supertest` con la app Express real y BD `:memory:`. Prueba el pipeline completo sin mockear nada. Verifica status codes, headers, y que el token desbloquea rutas protegidas.

## Risks / Trade-offs

- [refresh token en BD sin indice por userId] → Busquedas por hash son O(1) con el unique index en `token_hash`. Aceptable.
- [authMiddleware no consulta BD] → No puede detectar tokens revocados manualmente. Mitigacion: access tokens son de corta duracion (15 min). La revocacion real se hace en el refresh endpoint.
- [Dockerfile usa SQLite en volumen] → Un solo contenedor, no escala horizontalmente. Aceptable para TFM.
