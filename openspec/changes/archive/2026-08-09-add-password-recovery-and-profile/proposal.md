## Why

Un usuario que olvida su contraseña no tiene forma de recuperar el acceso a su cuenta: hoy solo existen `register`, `login`, `refresh`, `me` y `logout`. Tampoco existe ninguna forma de editar el perfil (username, direccion, datos de taller) ni de cambiar la contraseña estando autenticado. Necesitamos cerrar ambos huecos sin debilitar las garantias de seguridad ya establecidas (bcrypt, JWT, refresh token rotation, rate limiting, audit log).

## What Changes

- **Recuperacion de contraseña**: `POST /api/auth/forgot-password` (publico, rate-limited estricto) genera un token opaco de un solo uso con TTL configurable, lo persiste hasheado (SHA-256, mismo patron que `refresh_tokens`) y envia un email con el link de reseteo. La respuesta es siempre generica (anti-enumeracion de usuarios). `POST /api/auth/reset-password` (publico) valida el token, actualiza la contraseña, marca el token como usado, revoca todos los refresh tokens del usuario y resetea el bloqueo por intentos fallidos.
- **Cambio de contraseña autenticado**: `POST /api/profile/change-password` (protegido, rate-limited) verifica la contraseña actual, actualiza el hash y revoca todos los refresh tokens del usuario (fuerza reautenticacion en el resto de dispositivos).
- **Edicion de perfil**: `PATCH /api/profile` (protegido) permite actualizar parcialmente `username`, `address`, `businessName`, `taxId`. El email de login queda fuera de alcance (no editable por este endpoint). Valida unicidad de `username` si cambia.
- **Nuevo puerto `EmailSenderPort`**: abstrae el envio de email. Implementacion real con `nodemailer` sobre SMTP generico (variables de entorno, sin proveedor hardcodeado) y un adapter de fallback que loguea el link en consola cuando no hay `SMTP_HOST` configurado (dev/CI).
- **Nueva tabla `password_reset_tokens`** (Drizzle) y metodos nuevos en `UserRepository` (`updatePassword`, `updateProfile`, `existsByUsername` o equivalente) y en `RefreshTokenRepository` (`revokeAllForUser`).
- **Frontend**: paginas `/forgot-password`, `/reset-password`, y una nueva `/profile` con formularios de edicion de datos y cambio de contraseña, mas los metodos correspondientes en `apps/ui/src/lib/api.ts`.

## Capabilities

### New Capabilities
- `password-reset`: Flujo publico de recuperacion de contraseña por email (forgot + reset), con token de un solo uso, TTL, anti-enumeracion y revocacion de sesiones.
- `user-profile`: Edicion de perfil autenticada (datos de contacto/negocio) y cambio de contraseña autenticado, ambos excluyendo el email de login.

### Modified Capabilities
<!-- Ninguno — no se modifican specs existentes. auth-endpoints y auth-middleware siguen archivadas sin cambios; este cambio añade endpoints nuevos bajo /api/auth y /api/profile sin alterar register/login/refresh/me/logout. -->

## Impact

- Nuevo: `apps/core-api/src/domain/value-objects/passwordResetToken.ts` (o similar, si se decide en design.md)
- Nuevo: `apps/core-api/src/application/ports/EmailSenderPort.ts`
- Nuevo: `apps/core-api/src/application/ports/PasswordResetTokenRepository.ts`
- Nuevo: `apps/core-api/src/application/dto/auth/ForgotPasswordInput.ts`, `ResetPasswordInput.ts`
- Nuevo: `apps/core-api/src/application/dto/profile/ChangePasswordInput.ts`, `UpdateProfileInput.ts`
- Nuevo: `apps/core-api/src/application/use-cases/ForgotPasswordUseCase.ts`
- Nuevo: `apps/core-api/src/application/use-cases/ResetPasswordUseCase.ts`
- Nuevo: `apps/core-api/src/application/use-cases/ChangePasswordUseCase.ts`
- Nuevo: `apps/core-api/src/application/use-cases/UpdateProfileUseCase.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/controllers/ProfileController.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/routes/profile.routes.ts`
- Nuevo: `apps/core-api/src/infrastructure/persistence/sqlite/passwordResetTokenRepository.ts`
- Nuevo: `apps/core-api/src/infrastructure/persistence/mappers/passwordResetTokenMapper.ts`
- Nuevo: `apps/core-api/src/infrastructure/email/nodemailerEmailSender.ts`
- Nuevo: `apps/core-api/src/infrastructure/email/consoleEmailSender.ts`
- Nuevo: `apps/ui/src/routes/forgot-password.tsx`, `apps/ui/src/routes/reset-password.tsx`, `apps/ui/src/routes/profile.tsx`
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (tabla `password_reset_tokens`)
- Modificado: `apps/core-api/src/application/ports/UserRepository.ts` (metodos `updatePassword`, `updateProfile`, `existsByUsername`)
- Modificado: `apps/core-api/src/application/ports/RefreshTokenRepository.ts` (metodo `revokeAllForUser`)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/userRepository.ts`, `refreshTokenStore.ts`
- Modificado: `apps/core-api/src/infrastructure/http/controllers/AuthController.ts` (o nuevo controller dedicado; se decide en design.md), `apps/core-api/src/infrastructure/http/routes/auth.routes.ts`
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (montar `/api/profile` protegido, rate limiters nuevos)
- Modificado: `apps/core-api/src/infrastructure/http/middleware/rate-limiter.middleware.ts` (limiter dedicado forgot-password/change-password)
- Modificado: `apps/core-api/src/infrastructure/configuration/index.ts` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `APP_BASE_URL`, `PASSWORD_RESET_TTL_MINUTES`)
- Modificado: `apps/core-api/src/infrastructure/composition/composition.ts` (cablear EmailSenderPort, nuevos use cases y controller)
- Modificado: `apps/ui/src/lib/api.ts`, `apps/ui/src/lib/auth-context.tsx`, `apps/ui/src/components/dashboard/types.ts`, `apps/ui/src/routes/login.tsx` (link "olvidaste tu contraseña")
- Nuevo: tests unitarios + integracion para todo lo anterior (`apps/core-api/tests/**`, `apps/ui/tests/**`)
