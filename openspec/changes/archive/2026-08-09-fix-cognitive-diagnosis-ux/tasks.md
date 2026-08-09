## 0. Preparación

- [ ] 0.1 Confirmar en qué estado está `rebase-ui-autel-sidebar-dtc-badge`: si su tarea 2.6 (D4, `max-h-80 min-h-0` en `MechanicChat.tsx`) ya se aplicó o no. Si esa rama sigue activa en paralelo, coordinar con quien la lleve antes de tocar el scroll (sección 5 de este `tasks.md`)
- [ ] 0.2 Crear `feat/fix-cognitive-diagnosis-ux` desde `develop` (o desde `feat/restructure-ui-autel-flow` si el usuario confirma que se sigue trabajando en ese worktree)
- [ ] 0.3 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [ ] 0.4 Cargar contexto: este `proposal.md`/`design.md`, `ExecuteCognitiveDiagnosisUseCase.ts`, `mcpServer.ts` (`handleIndexPid`, registro de `index_pid`), `ExecuteLlmToolCalling.ts`, `llmErrors.ts`, `DiagnosisController.ts` (`handleCognitiveError`), `diagnosisService.ts` (rama cognitiva), `useCognitiveDiagnosis.ts`, `MechanicChat.tsx`, `PidsTable.tsx`, `DashboardLayout.tsx`, `apps/ui/src/lib/api.ts` (`assertOk`, `ApiHttpError`)

## 1. Backend: prompt enseña a indexar PIDs desconocidos (RED → GREEN → REFACTOR)

- [ ] 1.1 RED: test — el `systemPrompt` enviado a `sendMessage` contiene una instrucción explícita de usar `index_pid` cuando se lee un PID cuyo significado no se reconoce (leer el `systemPrompt` capturado por el mock de `LlmClientPort.sendMessage`)
- [ ] 1.2 GREEN: ampliar `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT` en `ExecuteCognitiveDiagnosisUseCase.ts` con la instrucción (incluir mención a `source: "web"`, y a aportar `mode`/`pid`/`formula`/`dataBytes` cuando se pueda inferir, para disparar la validación síncrona existente en `handleIndexPid`)
- [ ] 1.3 RED: test — el prompt no exige nada que rompa el contrato existente del bloque `---JSON---` final (test de regresión: con un mock que devuelve narrativa + bloque JSON válido, el parseo sigue funcionando igual que antes)
- [ ] 1.4 REFACTOR: con la suite en verde — revisar que el prompt no haya crecido en una única línea ilegible; dividir en constantes si aporta claridad, sin cambiar su contenido

## 2. Backend: prompt conciso orientado a mecánico (RED → GREEN → REFACTOR)

- [ ] 2.1 RED: test — el `systemPrompt` contiene una instrucción explícita de responder de forma concisa, con pasos o bullets accionables, dirigida a un mecánico
- [ ] 2.2 GREEN: añadir la instrucción al `COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT`
- [ ] 2.3 REFACTOR: con la suite en verde — revisar que las instrucciones de las secciones 1 y 2 no queden dispersas ni duplicadas dentro del array de líneas del prompt; si no hace falta refactor, marcar como revisada sin cambios

## 3. Backend: `MaxToolCallIterationsError` deja de caer al 500 (RED → GREEN → REFACTOR)

- [ ] 3.1 RED: test en `DiagnosisController` (o en `diagnosis.routes.test.ts`, siguiendo el patrón existente) — `POST /api/mcp/cognitive-diagnosis` con un `llmClient` mock que hace que `sendMessage` lance `MaxToolCallIterationsError` responde con un status 4xx específico (422), no 500 ni 503, y un mensaje que menciona "demasiados pasos" o equivalente accionable
- [ ] 3.2 GREEN: añadir el `if (err instanceof MaxToolCallIterationsError)` en `handleCognitiveError` (`DiagnosisController.ts`), devolviendo 422 con el mensaje definido en `design.md` Decisión 2
- [ ] 3.3 RED: test — un error no contemplado (ni timeout, ni scenario, ni máximo de iteraciones) sigue devolviendo 500 genérico sin filtrar el mensaje interno (test de regresión sobre el comportamiento ya existente)
- [ ] 3.4 GREEN: confirmar que el `if` nuevo no intercepta ese caso (debería pasar sin cambios si 3.2 se implementó bien)
- [ ] 3.5 REFACTOR: con la suite en verde — revisar que `ERROR_MESSAGES` y `handleCognitiveError` no dupliquen el texto del mensaje en dos sitios; si no hace falta refactor, marcar como revisada sin cambios

## 4. Frontend: `useCognitiveDiagnosis` deja de tragar errores (RED → GREEN → REFACTOR)

- [ ] 4.1 RED: test — con `api.getCognitiveDiagnosis` rechazando con un `ApiHttpError(status: 504)`, tras `trigger()` el hook expone `error.kind === "timeout"` y `error.message` con el texto recibido
- [ ] 4.2 RED: test — con status 422 (el nuevo mapeo del backend), `error.kind === "too_many_steps"`
- [ ] 4.3 RED: test — con status 404, `error.kind === "unavailable"`
- [ ] 4.4 RED: test — con un rechazo que no es `ApiHttpError` (o un status no contemplado), `error.kind === "unknown"` y `error.message` no vacío
- [ ] 4.5 RED: test — con un `error` previo en la cache de Query, un nuevo `trigger()` lo limpia a `null` mientras la petición está en curso
- [ ] 4.6 RED: test — con un `error` previo, si el nuevo `trigger()` resuelve con éxito, `error` queda en `null` en el estado final
- [ ] 4.7 GREEN: implementar `error` en `CognitiveState`, derivarlo en `onError`/`onSuccess` de la mutación, exponerlo en el `return` del hook; quitar el comentario `swallowed by design` y el `catch` mudo de `trigger()` (debe seguir sin relanzar hacia el llamador, pero ya no en silencio: el estado queda actualizado)
- [ ] 4.8 REFACTOR: con la suite en verde — revisar si la derivación de `kind` desde `ApiHttpError.status` merece su propia función pura testeable en vez de vivir inline en el `onError`; extraer si mejora legibilidad

## 5. Frontend: el chat muestra el error (RED → GREEN → REFACTOR)

- [ ] 5.1 RED: test — con `error` no nulo, `MechanicChat` renderiza `error.message` de forma visible en el hilo
- [ ] 5.2 RED: test — con `error` no nulo y `loading` true a la vez (caso borde: nuevo intento en curso tras limpiar el error previo), no se muestra el mensaje de error junto al estado de carga
- [ ] 5.3 RED: test — con `error` null, no aparece ningún mensaje de error (regresión del comportamiento actual)
- [ ] 5.4 GREEN: añadir prop `error` a `MechanicChatProps` y su renderizado condicional; propagar `cognitive.error` desde `DashboardPage.tsx`
- [ ] 5.5 REFACTOR: con la suite en verde — revisar que el bloque de error no repita el mismo patrón de badge/severidad que el diagnóstico exitoso sin necesidad

## 6. Frontend: `PidsTable` distingue error de vacío (RED → GREEN → REFACTOR)

- [ ] 6.1 RED: test — con `aiLoading: false`, `aiRows: []` y `aiError` no nulo, se muestra un aviso breve de fallo en la búsqueda de PIDs adicionales
- [ ] 6.2 RED: test — con `aiLoading: false`, `aiRows: []` y sin error, no se muestra ningún aviso (regresión del comportamiento actual)
- [ ] 6.3 GREEN: añadir prop `aiError` a `PidsTable`, renderizado condicional del aviso; propagar `cognitive.error` desde `DashboardPage.tsx`
- [ ] 6.4 REFACTOR: con la suite en verde — comprobar que `AiLoadingRow` y el nuevo aviso de error no dupliquen estructura; extraer si corresponde

## 7. Frontend: un único scroll en la sección de chat (RED → GREEN → REFACTOR)

- [ ] 7.1 RED: test — el contenedor del hilo de mensajes en `MechanicChat` no tiene una clase de altura máxima acoplada a scroll propio (verificar ausencia de `max-h-80`/`overflow-y-auto` en ese contenedor concreto, no en todo el componente)
- [ ] 7.2 GREEN: quitar `max-h-80 overflow-y-auto` del `div` del hilo de mensajes en `MechanicChat.tsx`; conservar `min-h-0`/`flex flex-col gap-2` donde siga haciendo falta para el layout
- [ ] 7.3 RED: test — `DashboardLayout` sigue teniendo `<main>` con `overflow-auto` (regresión, ya debería cumplirse sin tocar el fichero)
- [ ] 7.4 REFACTOR: con la suite en verde — comprobar visualmente (no solo con tests) que el hilo largo no rompe el layout del resto de la sección de chat; si aparece un problema de espaciado, ajustar clases sin reintroducir un segundo scroll

## 8. Verificación manual

- [ ] 8.1 Forzar (mock o desconectando el LLM) un timeout y comprobar que el chat muestra el aviso, no un silencio
- [ ] 8.2 Forzar `MaxToolCallIterationsError` (pregunta que dispare muchas tool calls, o mock temporal reduciendo `maxIterations`) y comprobar el mensaje en el chat y en la tabla de PIDs
- [ ] 8.3 Confirmar visualmente que la respuesta del LLM es más corta y con bullets/pasos en al menos dos preguntas distintas
- [ ] 8.4 Confirmar visualmente que un hilo largo de chat scrollea una sola vez, sin doble barra ni scroll atrapado
- [ ] 8.5 Con el vector store activo, provocar la lectura de un PID Mode 22 no estándar y comprobar (log o consulta directa a LanceDB) que `index_pid` se invocó
- [ ] 8.6 Anotar los resultados en el reporte — material para la memoria del TFM

## 9. Cierre

- [ ] 9.1 `@reviewer` sobre el diff completo
- [ ] 9.2 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde en `apps/core-api` y `apps/ui`
- [ ] 9.3 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 9.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 9.5 **Preguntar antes de commitear/pushear** — mostrar resumen y esperar OK humano
