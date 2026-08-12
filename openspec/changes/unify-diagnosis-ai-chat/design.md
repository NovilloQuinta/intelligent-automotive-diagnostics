## Context

Hoy el dashboard tiene dos secciones de sidebar para el mismo fin: `diagnosis` ("Diagnóstico", que renderiza `DiagnosisPanel.tsx` con un texto determinista ilegible) y `chat` ("Chat IA", que renderiza `MechanicChat.tsx` con el output real del LLM). El diagnóstico cognitivo se dispara automáticamente: `DashboardPage.tsx` tiene un `useEffect` sobre `selectedId` que encadena `run()` (diagnóstico determinista) → `trig()` (LLM), y `handleDiagnose` hace lo mismo. El backend `diagnosisService.cognitiveDiagnosis` ya crea una `diagnosis_session` por llamada y persiste el veredicto en `result_json` vía `buildDiagnosisSnapshot` (estructura `{ vehicle, diagnosis, timestamp }`), pero **cada turno de follow-up crea una sesión nueva** y la conversación no se persiste. Ver proposal.md para la motivación.

## Goals / Non-Goals

**Goals:**
- Un único apartado "Diagnóstico" (el chat) con 3 estados y lanzamiento a demanda.
- Follow-up encadenado a la misma `diagnosis_session`; la conversación persiste en `result_json`.
- Regeneración por sesión nueva; el historial recupera sesiones previas completas.
- Eliminar `DiagnosisPanel.tsx` sin crear tabla ni columna nuevas.

**Non-Goals:**
- No se toca el flujo del diagnóstico determinista (`useDiagnosis` / `ProcessVehicleDiagnosisUseCase`): sigue siendo el proveedor de fallos crudos (DTCs, severidad, datos en vivo, freeze frames, ECUs).
- No se cambia el prompt del LLM ni el use case `ExecuteCognitiveDiagnosisUseCase` (eso ya se hizo en `fix-cognitive-diagnosis-ux`).
- No se modifica el schema de Drizzle (se reutiliza `result_json`).
- No se toca el change activo `add-live-data-pid-selector`.

## Decisions

### Decisión 1: un solo apartado "Diagnóstico" = el chat; `MechanicChat` evoluciona a `DiagnosisChat`

Se fusionan las secciones `diagnosis` y `chat` del `Sidebar` en una única sección `diagnosis` (icono/label de "Diagnóstico"). El componente que antes era `MechanicChat` se renombra/evoluciona a `DiagnosisChat` y asume los 3 estados. `DiagnosisPanel.tsx` se elimina.

**Alternativas consideradas:** (a) mantener dos secciones y solo mover el output del LLM al panel — descartado, mantiene la desconexión que se quiere eliminar; (b) crear un componente nuevo desde cero — descartado, `MechanicChat` ya resuelve render markdown, badges de severidad/confianza y el hilo de mensajes; reutilizarlo evita duplicar lógica.

**Por qué el chat y no el panel como contenedor.** El chat ya es el sitio natural del output del LLM y del follow-up; el panel determinista no tiene input ni formato de conversación. Mantener el chat como única superficie respeta "el diagnóstico entra como primer mensaje y el mecánico pregunta en el mismo contexto".

### Decisión 2: lanzamiento a demanda — se desacopla el diagnóstico determinista del LLM

`handleDiagnose` (botón "Iniciar diagnóstico" en `live-data`/`dtc`) ejecuta **solo** `runDiagnosis()` (determinista). El `useEffect` de `DashboardPage` sobre `selectedId` deja de llamar a `run()`+`trig()`: solo conserva el `reset()` del estado cognitivo (limpiar el hilo del vehículo anterior). El LLM se lanza **solo** desde el CTA del chat (`onLaunchDiagnosis`), que llama a `cognitive.trigger()` sin query ni history (sesión nueva).

**Alternativas consideradas:** (a) conservar el auto-disparo y solo cambiar el destino del output — descartado, contradice el requisito "nada se lanza automáticamente" y sigue gastando llamadas LLM; (b) auto-disparar el determinista pero no el LLM — se mantiene el `reset` pero se quita `trig()`; el determinista ya se recoge con el botón explícito, así que el auto-disparo no aporta.

**Gate del CTA.** El CTA "Lanzar diagnóstico IA" queda **deshabilitado** mientras no haya datos de sesión: `selectedId` nulo o `result` determinista ausente (`!hasDiagnosis`). Con `result` presente pero `dtcCount === 0`, el CTA **sigue habilitado**: el backend ya tolera ausencia de DTCs (el LLM produce un "resumen de salud" con los datos de los que dispone vía tools).

### Decisión 3: tres estados en `DiagnosisChat`

El componente decide su estado con la misma señal que ya tiene: `conversationHistory` y `loading` (y `error`).

- **(a) vacío**: `conversationHistory.length === 0 && !loading` → CTA "Lanzar diagnóstico IA" + línea de contexto ("El asistente revisará DTCs, datos en vivo, freeze frames y ECUs del vehículo seleccionado"). El input de follow-up no se muestra (no hay hilo al que preguntar).
- **(b) generando**: `loading` → spinner + texto descriptivo ("Analizando datos OBD-II con IA…"). El input se muestra deshabilitado.
- **(c) diagnóstico**: `conversationHistory.length > 0` → el primer mensaje del asistente es el output del LLM; el input queda habilitado para follow-up.

El estado `error` se renderiza igual que hoy (`fix-cognitive-diagnosis-ux`), visible en el hilo; no rompe la máquina de estados (si hay error, vuelve a vacío o diagnóstico según el historial).

**Alternativas consideradas:** modelar un `discriminated union` de estado explícito (`{kind:'empty'} | {kind:'loading'} | {kind:'diagnosis'}`) en el hook — descartado por KISS: las tres señales (`history`, `loading`, `error`) ya determinan el estado sin estado redundante que pueda desincronizarse.

### Decisión 4: persistencia del diagnóstico en `result_json`, sin tabla nueva

Se reutiliza `diagnosis_sessions.result_json` (columna existente). La única evolución es **de contenido**: `buildDiagnosisSnapshot` añade un array `conversation` (turnos `{ role: 'user' | 'assistant', text, timestamp }`) al snapshot, de modo que la conversación completa quede recuperable desde `GET /api/diagnosis-history/:id` (que ya devuelve `resultJson`).

**Encadenado de follow-ups a la misma sesión.** El body del endpoint acepta un `sessionId` opcional (Zod, `int` positivo):

- **Sin `sessionId`** → sesión nueva (diagnóstico nuevo): `createSession` + `endSession` con el snapshot que incluye el primer turno.
- **Con `sessionId`** → se resuelve la sesión existente verificando propiedad (`findSessionById(id, userId)`); si no existe o no es del usuario, 404. Se reutiliza esa sesión: se lee su `result_json` previo, se añade el turno nuevo y se actualiza con un método nuevo `updateSessionResult(sessionId, snapshot)` en `VehicleRepository` (sin tocar schema).

La respuesta del endpoint pasa a incluir `sessionId` (el servicio devuelve `{ ...output, sessionId }`) para que el frontend mantenga el hilo.

**Alternativas consideradas:** (a) tabla nueva `diagnosis_conversations` — descartado por indicación explícita del usuario y porque `result_json` ya es el snapshot inmutable por diseño; (b) devolver `sessionId` en una cabecera — descartado, el body es más simple y ya se lee como JSON; (c) que el frontend reenvíe todo el historial sin `sessionId` y el backend siga creando sesiones por turno — descartado, fragmenta una conversación en N filas de historial y no satisface "la conversación se persiste ligada a su sesión".

### Decisión 5: regeneración por sesión nueva

"Lanzar diagnóstico IA" con un hilo previo existente **no** reutiliza la sesión anterior: el frontend reinicia el estado cognitivo (limpia `conversationHistory` y `sessionId`) y dispara `trigger()` sin `sessionId`, lo que crea una `diagnosis_session` nueva. La sesión anterior ya quedó cerrada y persistida en su `result_json`; aparece en el historial. La regla de UX es: **el CTA siempre inicia una sesión nueva** (diagnóstico fresco con el contexto actual); el follow-up es lo único que encadena a una sesión existente.

## Risks / Trade-offs

- **[Follow-up crea sesión nueva si el frontend pierde `sessionId`]** (ej. recarga de página a mitad de conversación) → Mitigación: `sessionId` vive en la cache de Query bajo la clave del vehículo; una recarga lo pierde y el siguiente mensaje abriría sesión nueva, lo que es aceptable (el diagnóstico inicial sigue persistido). Se documenta, no se mitiga con persistencia extra.
- **[`result_json` crece con la conversación]** → Mitigación: el historial de listado (`GET /api/diagnosis-history`) ya omite `resultJson`; solo el detalle lo carga. Conversaciones largas son aceptables para el caso de uso de taller.
- **[La IA con "sin DTCs" podría no dar un resumen útil]** → Riesgo ya asumido en el enfoque LLM; el system prompt actual no lo impide. Si en verificación manual el resumen no es útil, se iteraría el prompt (fuera de este cambio).
- **[Doble origen del estado cognitivo en `DashboardPage`]** → `DashboardPage` hoy orquesta `useDiagnosis` y `useCognitiveDiagnosis`; al quitar el auto-disparo hay que asegurar que no queden callbacks muertos (`onChatSend` vs nuevo `onLaunchDiagnosis`). Mitigación: task específica de wiring + tests de integración del componente.

## Migration Plan

1. Merge de `feat/unify-diagnosis-ai-chat` a `develop` (solo tras CI verde).
2. Sin migración de BD: `result_json` ya existe y se reutiliza; el nuevo campo `conversation` vive dentro del JSON, no del schema.
3. Rollback: revertir el merge; `DiagnosisPanel.tsx` se restaura desde git. Las sesiones persistidas con el nuevo formato de `result_json` siguen siendo JSON válido (los lectores actuales ignoran campos desconocidos al parsear `SessionReportState`).

## Open Questions

Ninguna que cambie specs, approach o task breakdown.
