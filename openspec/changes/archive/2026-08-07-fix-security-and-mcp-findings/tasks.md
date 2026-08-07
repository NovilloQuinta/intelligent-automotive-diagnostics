## 0. Preparación

- [x] 0.1 Rama `fix/diagnosis-service-typed-errors` desde `develop` (no `main`: `develop` es ahora la rama de integracion)
- [x] 0.2 Baseline verde: 531 tests
- [x] 0.3 Informe releido

## 1. Bloqueo de login esquivable (TDD) — SEGURIDAD

- **Archivo**: `apps/core-api/src/infrastructure/persistence/sqlite/userRepository.ts`

- [x] 1.1 RED: 5 `incrementFailedLogin` en paralelo dejaban el contador en 1
- [x] 1.2 GREEN: UPDATE atomico con `sql` — contador y bloqueo en una sola sentencia
- [x] 1.3 Test: 5 intentos en paralelo dejan `lockedUntil` no nulo

## 2. `isError` no llega al SDK MCP (TDD)

- **Archivo**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`

- [x] 2.1 RED: un handler que lanza no marcaba `isError`
- [x] 2.2 GREEN: `registerTool` reenvia `isError` ademas de `content`
- [x] 2.3 `withErrorHandling` usa `errorText`: una sola convencion

## 3. Payload del JWT validado con Zod (TDD) — SEGURIDAD

- **Archivo**: `apps/core-api/src/infrastructure/services/authService.ts`

- [x] 3.1 RED: token firmado con `sub` string y token sin `sub`
- [x] 3.2 GREEN: `jwtPayloadSchema` + `InvalidTokenPayloadError`, sin `as unknown as`

## 4. JSON Schema sin internos de Zod (TDD)

- **Archivo**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`

- [x] 4.1 Test de los 4 casos (string, number, boolean, optional) como red de seguridad
- [x] 4.2 GREEN: `instanceof` + `unwrap()`, API publica de Zod

## 5. Calidad

- [x] 5.1 `ToolNotFoundError` tipada desde `mcp/errors.ts`; `ExecuteLlmToolCalling` devuelve `ToolExecutionResult` discriminado
- [x] 5.2 `DiagnosisServiceOptions` y `AuthControllerUseCases`. `createLlmAdapter` ya usaba objeto de opciones — hallazgo obsoleto
- [x] 5.3 `logger` obligatorio en la config de ambos clientes; fuera `?? console`
- [x] 5.4 Fuera el email de `auth.login_failed` y `auth.register`
- [x] 5.5 Comprobar `result.content[0]` antes de leer `.text` (`diagnosisService.ts:135, 177`) — helper `firstText()` + `EmptyToolResultError`
- [x] 5.6 `logger` antes de `maxIterations`: `DEFAULT_MAX_ITERATIONS` vuelve a ser alcanzable

## 6. Cierre

- [x] 6.1 lint, format, test (545) y build en verde
- [x] 6.2 `gga run` en verde. **Nueva config (decisión usuario 7 ago)**: `PROVIDER="opencode:deepseek/deepseek-v4-flash"` en `.gga` — GGA revisa fichero completo en cada run (una llamada LLM por fichero) y quemaba el limite de sesion de Claude; DeepSeek via opencode no cuenta contra esa sesion, que queda solo para desarrollo. PASS con 3 warnings no bloqueantes (magic strings `'15m'`/`'7d'` y `'obd-diagnostics'`/`'0.2.0'` — deuda preexistente, no del diff). Review puntual con Claude: `GGA_PROVIDER="claude" gga run`
- [x] 6.3 GGA revisa el **fichero completo** (mantener `gga run` en pre-commit). Decision del usuario 7 ago: mas contexto = menos falsos positivos y caza codigo preexistente latente. `--pr-mode --diff-only` queda como opcion para revisiones de PR grandes
- [x] 6.4 SESION ACTUAL actualizado en `AGENTS.md` y guardado en Engram
- [ ] 6.5 Preguntar antes de commitear (regla 7)
