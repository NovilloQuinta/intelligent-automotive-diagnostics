## 0. Preparación

- [ ] 0.1 Rama `fix/security-and-mcp-findings` desde `main`
- [ ] 0.2 Baseline verde: `pnpm lint && pnpm format && pnpm test && pnpm build`
- [ ] 0.3 Releer el informe completo: `gga run` (proveedor ya en `claude`)

## 1. Bloqueo de login esquivable (TDD) — SEGURIDAD

- **Archivo**: `apps/core-api/src/infrastructure/persistence/sqlite/userRepository.ts`

- [ ] 1.1 RED: test que lanza N `incrementFailedLogin` en paralelo y espera que el contador suba N. Hoy sube 1
- [ ] 1.2 GREEN: incremento atómico con `sql\`failed_login_attempts + 1\`` o transacción
- [ ] 1.3 Test de integración: 5 intentos fallidos en paralelo dejan la cuenta bloqueada

## 2. `isError` no llega al SDK MCP (TDD)

- **Archivo**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`

- [ ] 2.1 RED: test que verifica que un handler con `isError: true` propaga el flag al SDK
- [ ] 2.2 GREEN: `registerTool` reenvía `isError` además de `content`
- [ ] 2.3 Unificar `withErrorHandling` con la misma convención — hoy hay dos y ninguna llega

## 3. Payload del JWT validado con Zod (TDD) — SEGURIDAD

- **Archivo**: `apps/core-api/src/infrastructure/services/authService.ts`

- [ ] 3.1 RED: token firmado con secreto válido pero `sub` de tipo string debe ser rechazado
- [ ] 3.2 GREEN: schema Zod para el payload, eliminando `as unknown as { sub: number }`

## 4. JSON Schema sin internos de Zod (TDD)

- **Archivo**: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`

- [ ] 4.1 RED: test sobre los tipos que se usan hoy (string, number, boolean, optional)
- [ ] 4.2 GREEN: construirlo con API pública en vez de `schema._def.typeName`

## 5. Calidad

- [ ] 5.1 Errores tipados en vez de comparar strings: `diagnosisService.ts:169` usa `ToolNotFoundError`, que ya existe; `ExecuteLlmToolCalling.ts:16` devuelve un objeto discriminado
- [ ] 5.2 Constructores con >4 parámetros → objeto de opciones (`diagnosisService.ts:90`, `createLlmAdapter.ts:37`)
- [ ] 5.3 Quitar `config.logger ?? console` de `anthropicClient.ts:138` y `openAiClient.ts:150` — reintroduce `console` como default de producción
- [ ] 5.4 Dejar de escribir el email en crudo en los logs (`LoginUserUseCase.ts:23`, `RegisterUserUseCase.ts:48`)
- [ ] 5.5 Comprobar `result.content[0]` antes de leer `.text` (`diagnosisService.ts:135, 177`)
- [ ] 5.6 `ExecuteLlmToolCalling.ts:21-29`: el parámetro requerido `logger` va detrás de uno con default, así que `DEFAULT_MAX_ITERATIONS` es inalcanzable. Reordenar

## 6. Cierre

- [ ] 6.1 `pnpm lint && pnpm format && pnpm test && pnpm build`
- [ ] 6.2 `gga run` en verde, ya sin `--no-verify`
- [ ] 6.3 Decidir si GGA debe revisar el fichero completo o solo el diff
- [ ] 6.4 Actualizar SESION ACTUAL en `AGENTS.md` y guardar en Engram
- [ ] 6.5 Preguntar antes de commitear (regla 7)
