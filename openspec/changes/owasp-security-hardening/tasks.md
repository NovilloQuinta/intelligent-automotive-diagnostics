## 1. Docker & Secrets (CRÍTICO)

- [x] 1.1 Fix Dockerfile: corregir COPY de `pnpm-lock.yaml` (apuntar a raíz del repo)
- [x] 1.2 Eliminar `ENV ACCESS_TOKEN_SECRET` y `ENV REFRESH_TOKEN_SECRET` hardcodeados del Dockerfile
- [x] 1.3 Añadir `change-me-in-production` a `assertProductionSecrets` en `configuration/index.ts`
- [x] 1.4 TDD: Test que `assertProductionSecrets` lanza con `change-me-in-production`

## 2. Account Lockout (TDD)

- [x] 2.1 Añadir columnas `failedLoginAttempts` y `lockedUntil` a tabla `users` en `schema.ts`
- [x] 2.2 RED: Tests para `LoginUserUseCase` con account lockout (bloqueo tras 5 fallos, desbloqueo login exitoso, error 423)
- [x] 2.3 GREEN: Implementar account lockout en `LoginUserUseCase.execute()`
- [x] 2.4 Añadir rate limit 5 req/min específico para `POST /api/auth/login` en `server.ts`
- [ ] 2.5 REFACTOR: Revisar TSDoc, coverage, limpiar magic numbers

## 3. CORS con paquete `cors`

- [x] 3.1 Instalar `cors` y `@types/cors` en `apps/core-api`
- [x] 3.2 Reemplazar middleware `applyCors` manual por `cors()` configurado en `server.ts`
- [ ] 3.3 RED: Test que verifica headers CORS (allowlist, métodos, Max-Age)
- [x] 3.4 GREEN: Configurar `origin` como función allowlist, `methods`, `allowedHeaders`, `maxAge`
- [ ] 3.5 REFACTOR: Extraer configuración de orígenes a constante

## 4. CSP + HSTS en Helmet

- [x] 4.1 Configurar `helmet({ contentSecurityPolicy, hsts, frameguard })` en `server.ts`
- [x] 4.2 CSP para API: `default-src 'none'` (solo JSON)
- [x] 4.3 HSTS: `maxAge: 31536000, includeSubDomains: true` (efectivo solo bajo HTTPS)
- [ ] 4.4 RED: Test que verifica headers CSP, HSTS, X-Frame-Options en respuestas
- [ ] 4.5 REFACTOR

## 5. Security Event Logging

- [x] 5.1 Inyectar `LoggerPort` en `LoginUserUseCase`, `RegisterUserUseCase`, `RefreshTokenUseCase`, `LogoutUserUseCase`
- [x] 5.2 Loguear eventos: `auth.login_success`, `auth.login_failed`, `auth.register`, `auth.refresh`, `auth.logout`, `auth.locked_out`
- [ ] 5.3 RED: Tests unitarios verificando que el logger se llama con el contexto correcto
- [x] 5.4 GREEN: Implementar logging en cada use case
- [ ] 5.5 REFACTOR: Extraer nombres de eventos a constantes, verificar no leak de secrets en logs

## 6. Password Complexity + No Leak

- [x] 6.1 Actualizar `registerUserSchema` con `.regex()` para requerir 1 mayúscula, 1 número, 1 carácter especial
- [x] 6.2 Añadir `.max(128)` a `loginUserSchema.password`
- [x] 6.3 Cambiar mensajes de error en login a "Invalid credentials" genérico (sin revelar si existe email)
- [ ] 6.4 RED: Tests para validación de complejidad y mensajes de error genéricos
- [x] 6.5 GREEN: Implementar cambios en schemas y controladores

## 7. Rate Limits por Endpoint

- [x] 7.1 Extender `createRateLimiter` para aceptar nombre/config por endpoint
- [x] 7.2 Crear limiters: `loginLimiter` (5/min), `refreshLimiter` (10/min), `diagnosisLimiter` (20/min), `cognitiveLimiter` (5/min)
- [x] 7.3 Montar limiters en `server.ts` en las rutas correspondientes
- [ ] 7.4 RED: Tests unitarios para cada rate limit
- [ ] 7.5 REFACTOR

## 8. Timeout HTTP en LLM Clients

- [x] 8.1 Timeout ya existente via SDK (Anthropic: `timeout` option, OpenAI: `timeout` option) — 30s default
- [x] 8.2 Timeout ya existente — no requiere cambios adicionales

## 9. Audit Log con userId + X-Request-Id + trust proxy

- [x] 9.1 Añadir columna `userId` (nullable) a tabla `audit_logs` en `schema.ts`
- [x] 9.2 Modificar `audit-logger.middleware.ts` para extraer `userId` del request si está autenticado
- [x] 9.3 Añadir `app.set('trust proxy', 1)` en `server.ts`
- [x] 9.4 Añadir middleware `X-Request-Id` (usar `crypto.randomUUID()`) en `server.ts`
- [ ] 9.5 RED: Tests para userId en audit log, X-Request-Id, trust proxy
- [x] 9.6 GREEN: Implementar cambios

## 10. Documentación (security.txt + threat model)

- [x] 10.1 Crear `public/.well-known/security.txt` con contacto académico
- [x] 10.2 Servir `security.txt` desde Express como static file
- [x] 10.3 Crear `docs/security.md` con threat model resumido (1 página)
- [ ] 10.4 Validar: `curl http://localhost:4000/.well-known/security.txt` devuelve 200

## 11. Integración Final

- [x] 11.1 Ejecutar suite completa: `pnpm lint && pnpm format && pnpm test && pnpm build`
- [ ] 11.2 Verificar cobertura: `pnpm test:coverage` (Core >= 100%, Features >= 80%)
- [ ] 11.3 Verificar headers: `curl -I http://localhost:4000/health` → CSP, HSTS, X-Content-Type-Options, X-Request-Id
- [ ] 11.4 Verificar account lockout: login fallido x5 → 423 Locked
- [ ] 11.5 Verificar `security.txt` accesible
- [ ] 11.6 Ejecutar `pnpm audit` y verificar 0 vulnerabilidades críticas
- [ ] 11.7 Actualizar CLAUDE.md con nuevo paso
