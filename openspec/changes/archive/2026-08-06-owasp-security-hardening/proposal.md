## Why

Tras una auditoría completa de seguridad OWASP Top 10 (2021) + OWASP API Top 10 (2023), se identificaron 17 gaps de seguridad en la API y el frontend. Los más críticos son: (1) el Dockerfile hardcodea secretos JWT `change-me-in-production` que pasan la validación de producción, (2) no hay protección contra fuerza bruta en login (sin account lockout), (3) CORS está implementado manualmente sin el paquete estándar, (4) Helmet CSP no está configurado explícitamente, y (5) los eventos de seguridad (login fallido, refresh revocado, etc.) no se registran.

Para un TFM que será evaluado, cubrir OWASP demuestra madurez profesional y atención a la seguridad.

## What Changes

### 🔴 Prioridad Alta (seguridad real)
- **Fix Dockerfile**: arreglar COPY de `pnpm-lock.yaml` (ruta incorrecta) y eliminar secretos hardcodeados `change-me-in-production`
- **`assertProductionSecrets`**: bloquear `change-me-in-production` como secreto inválido
- **Account lockout**: tras 5 intentos fallidos de login, bloquear cuenta 15 minutos. Nuevos campos `failedLoginAttempts` y `lockedUntil` en tabla `users`
- **CORS con paquete `cors`**: reemplazar middleware manual con el paquete estándar, añadir `Access-Control-Max-Age`
- **CSP explícito en Helmet**: configurar `contentSecurityPolicy` con directivas para API y UI
- **Security event logging**: loguear login exitoso/fallido, refresh revocado, registro nuevo, logout con `LoggerPort`
- **`trust proxy`**: `app.set('trust proxy', 1)` para IPs correctas en logs/rate-limit

### 🟡 Prioridad Media
- **Password complexity**: requerir 1 mayúscula, 1 número, 1 carácter especial en `registerUserSchema`
- **No leak de info**: errores genéricos "Invalid credentials" en login (sin revelar si existe el email)
- **Rate limits por endpoint**: `/api/auth/login` (5/min), `/api/auth/refresh` (10/min), `/api/diagnosis` (20/min), `/api/mcp/cognitive-diagnosis` (5/min)
- **Timeout HTTP en LLM clients**: 60s timeout en `anthropicClient.ts` y `openAiClient.ts`
- **Audit log con userId**: añadir `userId` (nullable) a `audit_logs` y capturarlo en el middleware

### 🟢 Prioridad Baja
- **`security.txt`**: endpoint `/.well-known/security.txt` con contacto académico
- **Threat model**: documento `docs/security.md` con amenazas y mitigaciones
- **HSTS explícito**: `Strict-Transport-Security` con `maxAge: 31536000`
- **X-Request-Id**: header de correlación en cada request
- **Password max length**: `.max(128)` en `loginUserSchema.password`

## Capabilities

### New Capabilities
- `account-lockout`: Bloqueo de cuenta tras 5 intentos fallidos de login, con desbloqueo automático tras 15 minutos
- `security-event-logging`: Registro estructurado de eventos de seguridad (auth success/failure, token refresh/revoke, registro)
- `per-endpoint-rate-limiting`: Rate limits diferenciados por endpoint sensible
- `csp-config`: Content-Security-Policy explícita en Helmet para API y UI

### Modified Capabilities
- `rate-limiting`: Ampliado con límites por endpoint (antes solo global + auth genérico)
- `audit-logging`: Ampliado con `userId` en los registros de auditoría

## Impact

- Modificado: `apps/core-api/Dockerfile` (fix COPY + secretos)
- Modificado: `apps/core-api/src/infrastructure/configuration/index.ts` (bloquear `change-me-in-production`)
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (CORS, CSP, trust proxy, HSTS, X-Request-Id)
- Modificado: `apps/core-api/src/infrastructure/http/middleware/rate-limiter.middleware.ts` (rate limits por endpoint)
- Modificado: `apps/core-api/src/infrastructure/http/middleware/audit-logger.middleware.ts` (userId)
- Modificado: `apps/core-api/src/application/dto/RegisterUserInput.ts` (password complexity)
- Modificado: `apps/core-api/src/application/dto/LoginUserInput.ts` (password max length)
- Modificado: `apps/core-api/src/application/use-cases/LoginUserUseCase.ts` (account lockout + logging)
- Modificado: `apps/core-api/src/application/use-cases/RegisterUserUseCase.ts` (security logging)
- Modificado: `apps/core-api/src/application/use-cases/RefreshTokenUseCase.ts` (security logging)
- Modificado: `apps/core-api/src/application/use-cases/LogoutUserUseCase.ts` (security logging)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/AuthController.ts` (errores genéricos)
- Modificado: `apps/core-api/src/infrastructure/llm/anthropicClient.ts` (timeout HTTP)
- Modificado: `apps/core-api/src/infrastructure/llm/openAiClient.ts` (timeout HTTP)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (campos `failedLoginAttempts`, `lockedUntil`, `userId` en audit_logs)
- Modificado: `apps/core-api/package.json` (dependencia `cors`)
- Nuevo: `public/.well-known/security.txt`
- Nuevo: `docs/security.md`
- Nuevos tests: account lockout, password complexity, rate limits por endpoint, CSP headers, CORS config
