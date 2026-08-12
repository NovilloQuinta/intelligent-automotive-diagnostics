## 0. Preparación

- [ ] 0.1 Verificar rama `feat/unify-diagnosis-ai-chat` desde `develop`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 0.3 Cargar contexto: `diagnosisService.ts` (`cognitiveDiagnosis`, `buildDiagnosisSnapshot`, `endSession`), `DiagnosisController.ts`, `VehicleRepository.ts` (puerto + sqlite), `useCognitiveDiagnosis.ts`, `MechanicChat.tsx`, `DashboardSection.tsx`, `DashboardPage.tsx`, `Sidebar.tsx`

## 1. Backend: snapshot inmutable con conversación

- [x] 1.1 RED: test — `buildDiagnosisSnapshot(vehicleInfo, diagnosis)` devuelve `resultJson` con `conversation: [{ role: 'assistant', text: <narrativa>, timestamp }]`
- [x] 1.2 RED: test — `buildDiagnosisSnapshot(vehicleInfo, undefined)` sigue devolviendo `null`
- [x] 1.3 GREEN: añadir `conversation` (primer turno del asistente) al snapshot en `diagnosisService.ts`
- [x] 1.4 REFACTOR: extraer helper `buildConversationTurn(role, text)` (se reutiliza en el follow-up); suite en verde

## 2. Backend: endpoint acepta y devuelve sessionId

- [x] 2.1 RED: test — `POST /api/mcp/cognitive-diagnosis` sin `sessionId` responde 200 incluyendo `sessionId` numérico
- [x] 2.2 RED: test — body con `sessionId` no entero positivo → 400 con detalles Zod
- [x] 2.3 RED: test — `sessionId` inexistente o de otro usuario → 404 (no crea sesión)
- [x] 2.4 GREEN: ampliar `CognitiveDiagnosisBodySchema`/`TcpSchema` en `DiagnosisController.ts` con `sessionId: z.number().int().positive().optional()`
- [x] 2.5 GREEN: `DiagnosisController.cognitiveDiagnosis` pasa `sessionId` al servicio y responde `{ ...result, sessionId }`
- [x] 2.6 GREEN: `diagnosisService.cognitiveDiagnosis` devuelve el `sessionId` de la sesión creada/resuelta
- [x] 2.7 REFACTOR: suite en verde

## 3. Backend: follow-up encadenado a la sesión

- [x] 3.1 RED: test — el puerto `VehicleRepository` expone `updateSessionResult(sessionId, result)` que actualiza `resultJson`/`severity`/`dtcCount`/`endedAt`
- [x] 3.2 GREEN: añadir `updateSessionResult` al puerto + implementación SQLite en `vehicleRepository.ts`
- [x] 3.3 RED: test — `cognitiveDiagnosis({ sessionId })` NO crea sesión nueva y añade el turno al `result_json` existente
- [x] 3.4 GREEN: rama de follow-up en `diagnosisService.cognitiveDiagnosis`: resolver sesión vía `findSessionById(id, userId)`, leer `result_json` previo, añadir turno, llamar `updateSessionResult`
- [x] 3.5 RED: test — `sessionId` de otro usuario → 404 sin mutar ninguna sesión
- [x] 3.6 GREEN: verificación de propiedad (`userId`) antes de actualizar
- [x] 3.7 REFACTOR: extraer `resolveSessionForFollowUp` si la rama crece; suite en verde

## 4. UI: useCognitiveDiagnosis mantiene el hilo por sessionId

- [x] 4.1 RED: test — `useCognitiveDiagnosis` guarda `sessionId` del output y lo devuelve en el estado
- [x] 4.2 GREEN: `lib/api.ts getCognitiveDiagnosis` envía `sessionId` en el body y lo devuelve en `CognitiveOutput`
- [x] 4.3 GREEN: `useCognitiveDiagnosis` añade `sessionId` a `CognitiveState`; `trigger(query)` reenvía `sessionId` en follow-up; `trigger()` sin query limpia `sessionId` (sesión nueva)
- [x] 4.4 REFACTOR: suite en verde

## 5. UI: DiagnosisChat con 3 estados y CTA

- [x] 5.1 RED: test — estado vacío (sin historial, sin loading) muestra CTA "Lanzar diagnóstico IA" + línea de contexto y NO muestra el input
- [x] 5.2 RED: test — estado generando (loading) muestra spinner + texto descriptivo y el input deshabilitado
- [x] 5.3 RED: test — estado diagnóstico (historial > 0) muestra el output del LLM como primer mensaje y el input habilitado
- [x] 5.4 RED: test — CTA deshabilitado cuando `canLaunch === false`; habilitado cuando `canLaunch === true` (incluido `dtcCount === 0`)
- [x] 5.5 GREEN: evolucionar `MechanicChat.tsx` → `DiagnosisChat.tsx` con props `onLaunchDiagnosis` y `canLaunch`; conservar render markdown, badge de severidad/confianza y manejo de `error`
- [x] 5.6 GREEN: renderizar los 3 estados desde `conversationHistory`/`loading`/`error`
- [x] 5.7 REFACTOR: extraer subcomponentes `EmptyState` / `GeneratingState` si el markup crece; suite en verde

## 6. UI: unificación en Sidebar y DashboardSection

- [x] 6.1 RED: test — `Sidebar` expone una única sección `diagnosis` (sin `chat`)
- [x] 6.2 GREEN: quitar `'chat'` de `SidebarSection`/`SECTIONS` en `Sidebar.tsx`
- [x] 6.3 RED: test — `DashboardSection` en `diagnosis` renderiza `DiagnosisChat` (no `DiagnosisPanel`)
- [x] 6.4 GREEN: en `DashboardSection.tsx`, el case `diagnosis` renderiza `DiagnosisChat`; eliminar case `chat` y el uso de `DiagnosisPanel`
- [x] 6.5 REFACTOR: suite en verde

## 7. UI: DashboardPage — desacoplar determinista de LLM y lanzar a demanda

- [x] 7.1 RED: test — al cambiar `selectedId` NO se dispara diagnóstico determinista ni cognitivo automáticamente (solo `reset` del estado cognitivo)
- [x] 7.2 RED: test — `handleDiagnose` ejecuta solo `runDiagnosis()` (sin `trigger` cognitivo)
- [x] 7.3 RED: test — `onLaunchDiagnosis` llama `cognitive.trigger()` sin query (sesión nueva)
- [x] 7.4 GREEN: reescribir `useEffect`/`handleDiagnose` y añadir `handleLaunchDiagnosis` en `DashboardPage.tsx`
- [x] 7.5 GREEN: calcular `canLaunch = hasDiagnosis && !!selectedId` y pasarlo a `DiagnosisChat`
- [x] 7.6 REFACTOR: revisar callbacks huérfanos (`onChatSend` vs `onLaunchDiagnosis`); suite en verde

## 8. Eliminación del panel determinista

- [x] 8.1 Eliminar `apps/ui/src/components/dashboard/DiagnosisPanel.tsx` y sus imports
- [x] 8.2 Verificar que `diagnosisText` determinista no queda como referencia rota; si se vuelve inútil, marcar/dejar explícito su destino sin romper `types.ts`
- [ ] 8.3 `@reviewer` sobre el diff UI (react-best-practices + code smells)

## 9. Verificación manual

- [ ] 9.1 Con emulador docker: entrar al vehículo NO dispara llamada LLM (ver logs del core-api)
- [ ] 9.2 "Iniciar diagnóstico" recoge DTCs/severidad sin lanzar la IA
- [ ] 9.3 Apartado "Diagnóstico" vacío → CTA con contexto; lanzar → spinner → diagnóstico como primer mensaje
- [ ] 9.4 Follow-up: pregunta encadenada a la misma sesión (ver historial: una sola fila para la conversación)
- [ ] 9.5 Regeneración: nuevo diagnóstico crea sesión nueva; el historial muestra ambas
- [ ] 9.6 Caso sin DTCs activos: lanzar igual → resumen de salud
- [ ] 9.7 Anotar resultados — material para memoria TFM

## 10. Cierre

- [ ] 10.1 `@quality` — lint + test + coverage + audit
- [ ] 10.2 `@reviewer` — diff completo
- [ ] 10.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 10.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 10.5 **Preguntar antes de commitear/pushear** (regla 7)
