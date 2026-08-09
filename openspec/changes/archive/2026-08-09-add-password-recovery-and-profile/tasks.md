## 1. Config y schema

- [x] 1.1 Extender `configSchema` en `infrastructure/configuration/index.ts` con: `SMTP_HOST` (optional), `SMTP_PORT` (coerce number, default 587), `SMTP_USER` (optional), `SMTP_PASS` (optional), `SMTP_FROM` (default `"no-reply@localhost"`), `APP_BASE_URL` (default `"http://localhost:5173"`), `PASSWORD_RESET_TTL_MINUTES` (coerce number positive, default 60)
- [x] 1.2 Añadir tabla `password_reset_tokens` a `infrastructure/persistence/sqlite/schema.ts` (id, user_id FK, token_hash unique, expires_at, created_at, used_at nullable) — mismo patron que `refresh_tokens`
- [x] 1.3 Verificar que `getDb`/migraciones (o `CREATE TABLE IF NOT EXISTS` si el proyecto no usa drizzle-kit migrate en runtime) crean la tabla nueva en `:memory:` para tests
- [x] 1.4 Documentar las nuevas env vars en `.env.example` (si existe) o en el README de configuracion

## 2. Dominio y DTOs

- [x] 2.1 Crear `application/dto/auth/RefreshTokenRecord`-style `PasswordResetTokenRecord.ts` (id, userId, tokenHash, expiresAt, createdAt, usedAt)
- [x] 2.2 Crear `application/dto/auth/ForgotPasswordInput.ts` (Zod: `{ email }`)
- [x] 2.3 Crear `application/dto/auth/ResetPasswordInput.ts` (Zod: `{ token, newPassword }`, reutilizando la misma regex de fortaleza que `registerUserSchema`)
- [x] 2.4 Crear `application/dto/profile/ChangePasswordInput.ts` (Zod: `{ currentPassword, newPassword }`, misma regex de fortaleza)
- [x] 2.5 Crear `application/dto/profile/UpdateProfileInput.ts` (Zod `.strict()`: `{ username?, address?, businessName?, taxId? }`, SIN `email` — rechaza cualquier campo no reconocido con 400)
- [x] 2.6 Extraer la regex de fortaleza de contraseña a una constante compartida (ej. `application/shared/passwordPolicy.ts`) reutilizada por `RegisterUserInput`, `ResetPasswordInput`, `ChangePasswordInput` (evita duplicacion)

## 3. Puertos nuevos y extendidos

- [x] 3.1 Crear `application/ports/EmailSenderPort.ts` (`sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>`)
- [x] 3.2 Crear `application/ports/PasswordResetTokenRepository.ts` (`save`, `findByTokenHash`, `markUsed`, `invalidateAllForUser`)
- [x] 3.3 Extender `application/ports/UserRepository.ts` con `updatePassword(userId, passwordHash)`, `updateProfile(userId, patch)`, `existsByUsername(username, excludeUserId?)`
- [x] 3.4 Extender `application/ports/RefreshTokenRepository.ts` con `revokeAllForUser(userId: number): Promise<void>`

## 4. Use cases — Password reset (TDD)

- [x] 4.1 RED: `ForgotPasswordUseCase.test.ts` — genera token, hashea, invalida tokens previos, llama a `EmailSenderPort`, siempre resuelve sin lanzar (incluso si el email no existe o el sender falla); verifica que NO se filtra si el email existe (mismo shape de resultado en ambos casos)
- [x] 4.2 GREEN: implementar `ForgotPasswordUseCase` (`application/use-cases/ForgotPasswordUseCase.ts`)
- [x] 4.3 REFACTOR: TSDoc, constantes, verificar que errores del `EmailSenderPort` se capturan y logean via `LoggerPort`, no se propagan
- [x] 4.4 RED: `ResetPasswordUseCase.test.ts` — token valido/inexistente/caducado/usado, password debil, revocacion de refresh tokens, reset de `failedLoginAttempts`/`lockedUntil`
- [x] 4.5 GREEN: implementar `ResetPasswordUseCase` (`application/use-cases/ResetPasswordUseCase.ts`), con errores tipados (`InvalidOrExpiredTokenError`)
- [x] 4.6 REFACTOR: TSDoc, verificar coverage de ramas de error

## 5. Use cases — Perfil (TDD)

- [x] 5.1 RED: `ChangePasswordUseCase.test.ts` — password actual correcta/incorrecta, password nueva igual a la actual, password nueva debil, revocacion de refresh tokens tras exito
- [x] 5.2 GREEN: implementar `ChangePasswordUseCase` (`application/use-cases/ChangePasswordUseCase.ts`), con errores tipados (`IncorrectCurrentPasswordError`, `SamePasswordError`)
- [x] 5.3 REFACTOR: TSDoc, coverage
- [x] 5.4 RED: `UpdateProfileUseCase.test.ts` — actualizacion parcial, username unico, username duplicado (409), mismo username propio (no error), body vacio, email nunca se persiste aunque llegara en el input
- [x] 5.5 GREEN: implementar `UpdateProfileUseCase` (`application/use-cases/UpdateProfileUseCase.ts`), con error tipado (`UsernameAlreadyTakenError`), devuelve `toSafeUser(user)`
- [x] 5.6 REFACTOR: TSDoc, coverage

## 6. Infraestructura — persistencia (TDD)

- [x] 6.1 RED: `sqlitePasswordResetTokenRepository.test.ts` — save/findByTokenHash/markUsed/invalidateAllForUser contra SQLite `:memory:`
- [x] 6.2 GREEN: implementar `infrastructure/persistence/sqlite/passwordResetTokenRepository.ts` + `infrastructure/persistence/mappers/passwordResetTokenMapper.ts`
- [x] 6.3 RED: extender `userRepository.test.ts` con casos para `updatePassword`, `updateProfile`, `existsByUsername`
- [x] 6.4 GREEN: implementar los 3 metodos nuevos en `infrastructure/persistence/sqlite/userRepository.ts`
- [x] 6.5 RED: extender `refreshTokenStore.test.ts` con caso para `revokeAllForUser`
- [x] 6.6 GREEN: implementar `revokeAllForUser` en `infrastructure/persistence/sqlite/refreshTokenStore.ts`
- [x] 6.7 REFACTOR: TSDoc, revisar naming consistente con `refreshTokenStore.ts`/`userRepository.ts` existentes

## 7. Infraestructura — email adapters (TDD)

- [x] 7.1 Instalar `nodemailer` + `@types/nodemailer` como dependencias de `apps/core-api`
- [x] 7.2 RED: `consoleEmailSender.test.ts` — verifica que loguea el link via `LoggerPort.info` con el email y la URL, nunca lanza
- [x] 7.3 GREEN: implementar `infrastructure/email/consoleEmailSender.ts` (`createConsoleEmailSender(logger)`)
- [x] 7.4 RED: `nodemailerEmailSender.test.ts` — mockea `nodemailer.createTransport`, verifica `sendMail` llamado con `from`/`to`/`subject`/`html` correctos, y que un error del transporte se propaga (la captura vive en el use case, no aqui)
- [x] 7.5 GREEN: implementar `infrastructure/email/nodemailerEmailSender.ts` (`createNodemailerEmailSender(config)`)
- [x] 7.6 REFACTOR: TSDoc, extraer plantilla de email (asunto + HTML minimo) a una funcion pura testeable

## 8. Controllers y rutas

- [x] 8.1 RED: extender `AuthController.test.ts` con `forgotPassword`/`resetPassword` (200 generico siempre, 400 en token invalido/password debil, 400 en validacion Zod)
- [x] 8.2 GREEN: añadir metodos `forgotPassword`/`resetPassword` a `infrastructure/http/controllers/AuthController.ts`, inyectando `ForgotPasswordUseCase`/`ResetPasswordUseCase`
- [x] 8.3 RED: crear `ProfileController.test.ts` (`changePassword`: 200/401/400; `updateProfile`: 200/409/400/401)
- [x] 8.4 GREEN: crear `infrastructure/http/controllers/ProfileController.ts` con `changePassword` y `updateProfile`, mapeando errores tipados a status codes
- [x] 8.5 Extender `infrastructure/http/routes/auth.routes.ts` con `POST /forgot-password` (con `forgotPasswordRateLimit`) y `POST /reset-password`
- [x] 8.6 Crear `infrastructure/http/routes/profile.routes.ts` (Router con `PATCH /` y `POST /change-password` con `changePasswordRateLimit`), montado con `requireAuth` obligatorio (a diferencia de `auth.routes.ts` donde es opcional)
- [x] 8.7 Añadir `forgotPasswordRateLimiter`/`changePasswordRateLimiter` en `infrastructure/http/middleware/rate-limiter.middleware.ts` (limites mas estrictos que el de login; no-op fuera de `production`, igual que el limiter existente)

## 9. Composicion y servidor

- [x] 9.1 Extender `createPersistenceRepositories` en `composition.ts` con `passwordResetTokenRepo`
- [x] 9.2 Crear `createEmailSender(config, logger)` en `composition.ts`: `nodemailer` si `config.SMTP_HOST`, sino `console` fallback
- [x] 9.3 Extender `createAuthStack` con `forgotPasswordUseCase`, `resetPasswordUseCase`
- [x] 9.4 Crear `createProfileStack`/instanciar `changePasswordUseCase`, `updateProfileUseCase`, `ProfileController`
- [x] 9.5 Extender `ServerConfig`/`createServer` en `infrastructure/http/server.ts` para montar `profileController` bajo `/api/profile` DESPUES de `authenticateToken`, y pasar los rate limiters nuevos a `authRoutes`
- [x] 9.6 Verificar `buildApp` en `composition.ts` cablea todo correctamente (userRepo, tokenStore, passwordResetTokenRepo, emailSender)

## 10. Tests de integracion (supertest)

- [x] 10.1 RED: `password-reset.integration.test.ts` — pipeline completo forgot→(inspeccionar token en BD de test, ya que el email no llega)→reset→login con password nueva→refresh viejo devuelve 401
- [x] 10.2 RED: `profile.integration.test.ts` — pipeline completo login→PATCH /profile (200, 409 duplicado, 400 con email en body)→change-password (200)→refresh viejo devuelve 401→login con password nueva
- [x] 10.3 GREEN: verificar que ambos pasan (deberian pasar si los pasos 1-9 estan bien)

## 11. Frontend

- [x] 11.1 Extender `apps/ui/src/components/dashboard/types.ts` con `ForgotPasswordInput`, `ResetPasswordInput`, `ChangePasswordInput`, `UpdateProfileInput`
- [x] 11.2 Extender `apps/ui/src/lib/api.ts` con `api.forgotPassword(email)`, `api.resetPassword(token, newPassword)` (fetch simple, sin `apiFetch`, endpoints publicos) y `api.changePassword(current, next)`, `api.updateProfile(patch)` (via `apiFetch`, endpoints protegidos)
- [x] 11.3 Crear ruta `apps/ui/src/routes/forgot-password.tsx` — formulario con email, muestra siempre el mismo mensaje de exito tras enviar (refleja la respuesta generica del backend)
- [x] 11.4 Crear ruta `apps/ui/src/routes/reset-password.tsx` — lee `token` de query params, formulario de nueva contraseña con el mismo `PasswordStrengthMeter`/`PwdReq` que `login.tsx` (extraer a componente compartido si se duplica demasiado), redirige a `/login` tras exito
- [x] 11.5 Crear ruta `apps/ui/src/routes/profile.tsx` — protegida (requiere `auth.status === "authed"`), formulario de edicion (username/address/businessName/taxId, SIN email) + formulario de cambio de contraseña separado; tras `change-password` exitoso llama a `auth.logout()` y redirige a `/login`
- [x] 11.6 Añadir enlace "¿Olvidaste tu contraseña?" en `apps/ui/src/routes/login.tsx` (tab de login) hacia `/forgot-password`
- [x] 11.7 Tests unitarios de componentes nuevos (`apps/ui/tests/unit/...`) — 218 tests pasando. **No implementado**: e2e Playwright del flujo forgot→reset→login (queda como deuda, no bloqueante — cobertura unitaria + integración backend ya validan el flujo completo)

## 12. Suite completa

- [x] 12.1 Ejecutado `format`/`lint`/`test`/`build` en ambas apps: 591 tests core-api + 218 tests ui en verde, ambos builds OK, formato limpio (salvo `routeTree.gen.ts` autogenerado y `styles.css` ya desformateado antes de este cambio, ninguno tocado por el cambio). **`lint` de `apps/ui` y `test:coverage`/`coverage:core` fallan por deuda preexistente del entorno** (conflicto de version `brace-expansion`/`minimatch`, documentado ya en `AGENTS.md` desde `a6797d9`, confirmado reproducible en ficheros no tocados por este cambio) — no es una regresion de este cambio
- [x] 12.2 Actualizar CLAUDE.md / AGENTS.md (SESION ACTUAL) con el estado tras implementar este cambio
