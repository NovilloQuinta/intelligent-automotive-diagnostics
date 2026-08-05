## Context

API Express 5 + TanStack Start SPA. Stack: TypeScript, Express 5, Drizzle ORM + better-sqlite3, JWT + bcrypt auth, Helmet 8, pino logging, factory functions, TDD con Vitest. Proyecto TFM con Clean Architecture + MCP.

La API ya tiene: Helmet con defaults, rate limiting global (100/15min), JWT auth con refresh token rotation, bcrypt 12 rounds, audit logging HTTP, Zod validation en todos los inputs. El frontend tiene CSP propia y react-hook-form + zodResolver.

Este change cierra los 17 gaps identificados en la auditoría OWASP, priorizados por criticidad y visibilidad académica.

## Goals / Non-Goals

**Goals:**
- Eliminar secretos hardcodeados del Dockerfile y fortalecer `assertProductionSecrets`
- Proteger contra fuerza bruta con account lockout (5 intentos → 15 min bloqueo)
- Reemplazar CORS manual con paquete `cors` estándar
- Configurar CSP explícita en Helmet
- Registrar eventos de seguridad (login, refresh, registro, logout) en logs estructurados
- Endurecer requisitos de contraseña (complejidad)
- Rate limits diferenciados por endpoint sensible
- No leak de información en mensajes de error de auth
- Timeout HTTP en clientes LLM externos
- Añadir `userId` al audit log, `trust proxy`, `X-Request-Id`, HSTS explícito, `security.txt`

**Non-Goals:**
- MFA / 2FA (fuera de alcance del TFM)
- Token blacklist para access tokens (la ventana de 15min es aceptable)
- Migración a httpOnly cookies (cambio de arquitectura frontend completo)
- RBAC completo con roles (userType ya existe, enforcement es futuro)
- Rate limiting distribuido (Redis) — memoria es suficiente para TFM
- Cifrado de SQLite en reposo (SQLCipher)

## Decisions

### 1. Account lockout: en BD vs en memoria
**Elegido**: BD (SQLite). Dos nuevos campos en tabla `users`: `failedLoginAttempts INTEGER DEFAULT 0`, `lockedUntil TEXT` (ISO 8601, nullable). En cada login fallido se incrementa; al llegar a 5, se setea `lockedUntil = now + 15min`. En login exitoso se resetea a 0. El rate limit de login (5/min) es capa adicional.

### 2. CORS: paquete `cors` vs mantener implementación manual
**Elegido**: Paquete `cors`. La implementación manual funciona pero no tiene `Access-Control-Max-Age`, no maneja `credentials`, y es código custom que hay que mantener. El paquete `cors` es el estándar de Express (5k+ stars), ya es dependencia transitiva en node_modules, y su configuración es declarativa y testeada por la comunidad.

### 3. CSP: configuración por entorno
**Elegido**: CSP diferente para API y UI. La API (`/api/*`) usa `default-src 'none'` (solo devuelve JSON, no renderiza HTML). La UI ya tiene su propia CSP en `apps/ui/src/server.ts`. La API añade `frame-ancestors 'none'` para prevenir clickjacking en Swagger UI.

### 4. Security logging: LoggerPort existente vs nuevo mecanismo
**Elegido**: Usar `LoggerPort` existente (`Logger` con pino). Los eventos de seguridad se loguean con `logger.info()` y contexto estructurado: `{ event: 'auth.login_success', userId, ip }`. El `Logger` ya persiste en tabla `logs`. Sin cambios de arquitectura.

### 5. Rate limits por endpoint: middleware factory vs routes manuales
**Elegido**: Extender `createRateLimiter` para aceptar diferentes configuraciones por endpoint. Se crean instancias separadas: `loginLimiter` (5/min), `refreshLimiter` (10/min), `diagnosisLimiter` (20/min), `cognitiveLimiter` (5/min). Todas usan `express-rate-limit`. Se montan en las rutas correspondientes en `server.ts`.

### 6. Timeout LLM: AbortController vs timeout en cliente HTTP
**Elegido**: `AbortSignal.timeout(60_000)` en el fetch/request del cliente LLM. Es el approach más simple y funciona con ambos SDKs (Anthropic y OpenAI). El frontend ya usa `AbortSignal.timeout` para el endpoint cognitivo (60s).

### 7. Dockerfile: multi-stage vs single-stage
**Elegido**: Arreglar el Dockerfile existente (single-stage) corrigiendo el COPY de `pnpm-lock.yaml` (debe apuntar a la raíz del repo) y eliminando los `ENV` con secretos hardcodeados. En su lugar, documentar que los secretos deben inyectarse en runtime (`docker run -e` o secrets manager).

## Risks / Trade-offs

- [Account lockout DoS] → Un atacante podría bloquear cuentas deliberadamente. Mitigación: el rate limit de 5 req/min ya reduce el vector; el bloqueo es temporal (15 min); se podría añadir notificación al usuario en el futuro.
- [Rate limits en memoria] → Se pierden al reiniciar. Mitigación: aceptable para TFM; las ventanas son cortas.
- [CSP en API] → Si se añaden endpoints HTML en el futuro, la CSP `default-src 'none'` los romperá. Mitigación: fácil de ajustar por ruta.
- [`cors` package] → Nueva dependencia directa. Mitigación: ya es transitiva; peso mínimo.
- [Timeout LLM 60s] → Diagnósticos muy complejos podrían cortarse. Mitigación: 60s es generoso; el frontend ya espera 60s.
