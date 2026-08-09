## Context

API Express 5 con Clean Architecture (`domain/ → application/ → infrastructure/`, factory functions, puertos con sufijo `Port`). Ya existen: `User` entity (username, email, passwordHash, userType, businessName?, taxId?, address?, createdAt, failedLoginAttempts, lockedUntil), `UserRepository` (findByEmail, findById, create, incrementFailedLogin, resetFailedLogins), `RefreshTokenRepository` (saveRefreshToken, findRefreshToken, revokeRefreshToken) con implementacion SQLite (`refresh_tokens`: id, userId, tokenHash unico, expiresAt, createdAt, revokedAt), `hashToken()` (SHA-256 hex) en `application/shared/hashToken.ts`, `toSafeUser()` en `application/shared/safeUser.ts`, `createAuthService` (bcrypt 12 rounds + JWT), `createAuthMiddleware` (verifica JWT, setea `req.userId`, no consulta BD), `createRateLimiter` (express-rate-limit, no-op fuera de `production`), y `AppConfig` validado con Zod en `infrastructure/configuration/index.ts`. No existe hoy ningun servicio de email, tabla de tokens de reseteo, ni metodos de actualizacion en `UserRepository`.

## Goals / Non-Goals

**Goals:**
- Flujo forgot/reset-password seguro: token opaco de un solo uso, hasheado en BD, TTL configurable, anti-enumeracion de usuarios, revocacion de sesiones al resetear.
- Cambio de contraseña autenticado con verificacion de la contraseña actual y revocacion de sesiones.
- Edicion parcial de perfil (username, address, businessName, taxId) sin tocar el email.
- Envio de email desacoplado de la infraestructura concreta (puerto + dos adapters).

**Non-Goals:**
- Verificacion de email / doble opt-in en registro.
- Notificar por email un cambio de contraseña exitoso (se puede añadir despues; no bloquea este cambio).
- 2FA / MFA.
- Historial de contraseñas anteriores (no reusar la N anterior).
- Cambiar el email de login (explicitamente fuera de alcance del PATCH de perfil).

## Decisions

### 1. Token de reseteo: opaco, 256 bits, hasheado en BD (mismo patron que refresh tokens)
**Elegido**: `crypto.randomBytes(32).toString('hex')` genera el token que se envia por email (nunca se persiste en claro). Se reutiliza `hashToken()` (SHA-256) para calcular el `tokenHash` almacenado en `password_reset_tokens`. Igual que con `refresh_tokens`, una fuga de la BD no compromete tokens activos. La comparacion en `reset-password` se hace por hash exacto, no por JWT: el token no necesita ser verificable sin BD (a diferencia del access token), asi que un JWT firmado no aporta nada aqui y añade complejidad (secret adicional, necesidad de invalidacion antes de expiry). Un token opaco de un solo uso con estado en BD es mas simple y mas facil de invalidar.

### 2. Tabla `password_reset_tokens` — mismo patron que `refresh_tokens`
```
password_reset_tokens
  id            integer PK autoincrement
  user_id       integer NOT NULL references users.id
  token_hash    text NOT NULL UNIQUE
  expires_at    text NOT NULL
  created_at    text NOT NULL default now
  used_at       text NULL
```
Sin columna `revoked_at`: la invalidacion de tokens previos al pedir uno nuevo se hace con un `DELETE`/soft-expire explicito (`invalidateAllForUser`) en vez de un flag adicional, para no duplicar el concepto de "used_at vs revoked_at" que ya tiene ambigüedad en `refresh_tokens`. Un token es valido si `used_at IS NULL AND expires_at > now()`.

### 3. Politica anti-enumeracion de usuarios (forgot-password)
**Elegido**: `POST /api/auth/forgot-password` SIEMPRE responde `200 { message: "If that email exists, a reset link has been sent." }` (mensaje generico, en ingles como el resto de mensajes de error existentes en el codebase), independientemente de si el email existe, esta bloqueado, o si el envio de email falla. La rama "email no encontrado" hace early-return despues de una espera artificial minima (mismo orden de magnitud que el flujo feliz) para no filtrar la existencia del usuario por timing — se documenta como mejora opcional, no bloqueante para este cambio (ver Risks). El error de envio de email se loguea vía `LoggerPort` con nivel `error` pero nunca se propaga al cliente ni cambia el status code.

### 4. TTL configurable y single-use
**Elegido**: nueva env var `PASSWORD_RESET_TTL_MINUTES` (Zod, `z.coerce.number().int().positive().default(60)`) en `AppConfig`. El use case `ForgotPasswordUseCase` calcula `expiresAt = now + ttlMinutes`. Antes de crear el token nuevo, invalida (borra o marca `used_at = now()`) todos los tokens previos no usados del usuario — un usuario solo puede tener un reset link activo a la vez. `ResetPasswordUseCase` verifica `used_at IS NULL` y `expires_at > now()`; si no, 400 generico (`"Invalid or expired token"}`, sin distinguir "no existe" de "caducado" de "ya usado", para no dar pistas). Tras un reset exitoso marca `used_at = now()` — el token no se reutiliza aunque siga sin caducar.

### 5. Revocacion de refresh tokens en reset-password y change-password
**Elegido**: ambos use cases llaman a un metodo nuevo `RefreshTokenRepository.revokeAllForUser(userId)` (equivalente a `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = ? AND revoked_at IS NULL`) tras actualizar el hash de la contraseña. Esto fuerza el cierre de sesion en todos los dispositivos — comportamiento estandar de seguridad tras un cambio de contraseña (OWASP ASVS 3.3.1). `reset-password` ademas llama a `UserRepository.resetFailedLogins(userId)` para levantar cualquier bloqueo por intentos fallidos, ya que el usuario acaba de demostrar posesion del email.

### 6. Rate limiting dedicado, mas estricto que login
**Elegido**: dos limiters nuevos en `rate-limiter.middleware.ts` (o instancias adicionales de `createRateLimiter` con config propia): `forgotPasswordRateLimiter` (ej. 5 peticiones / 15 min por IP) y `changePasswordRateLimiter` (ej. 5 peticiones / 15 min por IP, protege contra fuerza bruta con un access token robado). Se mantiene el mismo patron que el limiter existente (no-op fuera de `production`, para no romper tests/dev). `reset-password` no necesita limiter dedicado adicional porque el token en si ya actua como secreto de un solo uso de 256 bits — fuerza bruta sobre el token es inviable; se deja el rate limiter global de la app como unica proteccion ahi.

### 7. `EmailSenderPort` con dos adapters (nodemailer real + fallback de consola)
**Elegido**:
```ts
// application/ports/EmailSenderPort.ts
export interface EmailSenderPort {
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>
}
```
- `infrastructure/email/nodemailerEmailSender.ts`: `createNodemailerEmailSender(config)` usa `nodemailer.createTransport({ host, port, auth: { user, pass } })` (SMTP generico — el usuario tiene un buzon IONOS, pero nada queda hardcodeado a un proveedor: host/puerto/usuario/contraseña vienen de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
- `infrastructure/email/consoleEmailSender.ts`: `createConsoleEmailSender(logger)` loguea el link de reset via `LoggerPort.info(...)` en vez de enviar nada. Se usa automaticamente en dev/CI.
- El composition root decide cual instanciar: `config.SMTP_HOST ? createNodemailerEmailSender(...) : createConsoleEmailSender(logger)`. Mismo patron que `createLlmClient` (selecciona adapter segun config, sin condicionales dispersos por el codigo).
- El link enviado tiene forma `${APP_BASE_URL}/reset-password?token=<token>`. Nueva env var `APP_BASE_URL` (default `http://localhost:5173` para dev).

### 8. `ForgotPasswordUseCase` / `ResetPasswordUseCase` como casos de uso separados de `ChangePasswordUseCase` / `UpdateProfileUseCase`
**Elegido**: cuatro use cases nuevos, cada uno con una sola responsabilidad (mismo patron que `RegisterUserUseCase`, `LoginUserUseCase`). No se reutiliza un "PasswordService" generico porque las reglas de invalidacion/errores difieren (forgot-password nunca revela informacion; change-password si distingue 401 de contraseña incorrecta).

### 9. Controllers: extender `AuthController` para forgot/reset, `ProfileController` nuevo para change-password/perfil
**Elegido**: `forgotPassword` y `resetPassword` se añaden como metodos de `AuthController` (mismo patron try/catch que `register`/`login`/`refresh`, viven bajo `/api/auth/*`, son publicos). `change-password` y `PATCH /profile` viven en un `ProfileController` nuevo bajo `/api/profile/*` porque son endpoints protegidos con un ciclo de vida distinto (requieren `req.userId`) y para no sobrecargar `AuthController` con responsabilidades de perfil.

### 10. Rutas: `profile.routes.ts` montado tras el middleware de auth
**Elegido**: siguiendo el pipeline existente (`helmet → rateLimiter → auditLogger → express.json → /api/auth/* (publico) → authenticateToken → rutas protegidas`), `/api/profile/*` se monta junto a `/api/scenarios`, `/api/diagnosis`, `/api/mcp/tools/*`, es decir DESPUES del middleware `authenticateToken`. `forgot-password` y `reset-password` se montan dentro de `authRoutes` (publico), igual que `register`/`login`.

### 11. `UserRepository`: nuevos metodos `updatePassword`, `updateProfile`, `existsByUsername`
**Elegido**:
```ts
updatePassword(userId: number, passwordHash: string): Promise<void>
updateProfile(userId: number, patch: Partial<Pick<User, 'username' | 'address' | 'businessName' | 'taxId'>>): Promise<User>
existsByUsername(username: string, excludeUserId?: number): Promise<boolean>
```
`updateProfile` valida unicidad de `username` a nivel de aplicacion (`UpdateProfileUseCase` llama a `existsByUsername` antes de persistir) para poder devolver 409 con mensaje claro; el `UNIQUE` constraint de SQLite en `users.username` actua como red de seguridad ante condiciones de carrera, capturado como fallback 409 si la constraint salta igualmente.

### 12. Email de login explicitamente fuera de alcance del PATCH de perfil
**Elegido**: `UpdateProfileInput` (Zod) NO incluye `email`. Si el body incluye `email`, Zod con `.strict()` (o el propio `.pick()`/`.partial()` sobre un objeto que no contiene `email`) lo rechaza con 400 en vez de ignorarlo silenciosamente — evita que un cliente crea que cambio el email cuando no fue asi.

### 13. Frontend: nuevas rutas + extension de `api.ts` sin tocar el contrato de `AuthContext`
**Elegido**: `forgot-password.tsx` y `reset-password.tsx` son paginas standalone (no requieren `AuthProvider` autenticado) que llaman directamente a `api.forgotPassword(email)` / `api.resetPassword(token, newPassword)`, siguiendo el patron fetch simple ya usado en `api.login`/`api.register` (sin `apiFetch`, porque son endpoints publicos). `profile.tsx` es una ruta protegida que usa `apiFetch` (via `api.updateProfile(patch)` / `api.changePassword(current, next)`) igual que `getScenarios`/`runDiagnosis`. `login.tsx` añade un enlace "¿Olvidaste tu contraseña?" hacia `/forgot-password`. Tras un `change-password` o `reset-password` exitosos que revocan refresh tokens, el frontend debe tratar la sesion actual como invalidada: `change-password` fuerza `logout()` local inmediato (el propio access token en uso sigue siendo valido hasta que expire — 15 min — porque el middleware no consulta BD; documentado como limitacion aceptada, igual que en `auth-middleware` original).

## Risks / Trade-offs

- [`authMiddleware` no consulta BD] → tras un `change-password`/`reset-password`, el access token en curso sigue siendo valido hasta sus 15 min de expiracion aunque el refresh token ya este revocado. Mismo trade-off aceptado ya en `add-auth-endpoints-and-middleware`. Mitigacion: el frontend cierra sesion localmente de inmediato tras `change-password`.
- [Timing attack en `forgot-password` entre email existente/inexistente] → no se implementa un retraso artificial calibrado en este cambio; la respuesta es identica en contenido y codigo HTTP, pero el tiempo de proceso puede variar levemente (hash bcrypt no se ejecuta en la rama "no existe"). Se documenta como mejora futura, no bloqueante para un TFM.
- [Un unico reset token activo por usuario] → si un usuario pide varios resets seguidos (ej. reenviar email), solo el ultimo link funciona. Comportamiento intencional (reduce superficie de ataque) pero debe comunicarse en el email/UI.
- [`nodemailer` con SMTP real sin verificar credenciales en arranque] → si `SMTP_HOST` esta mal configurado, el fallo solo se detecta al primer envio (logueado, no propagado). Aceptable para un TFM; se podria añadir `transporter.verify()` en el composition root como mejora futura.
- [`password_reset_tokens` sin indice explicito por `user_id`] → las busquedas de invalidacion (`invalidateAllForUser`) hacen table scan sobre una tabla pequeña; aceptable al volumen esperado (mismo trade-off que `refresh_tokens`, que tampoco tiene indice por `user_id`).
