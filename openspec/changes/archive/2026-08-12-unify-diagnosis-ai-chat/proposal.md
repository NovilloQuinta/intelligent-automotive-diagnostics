## Why

El dashboard del mecánico tiene hoy **dos superficies de diagnóstico redundantes y desconectadas**: la sección "Diagnóstico" muestra un string determinista ilegible en inglés (formato `[CRITICAL]`, nombres de PID crudos) en `DiagnosisPanel.tsx`, mientras que el output real del LLM —con narrativa, severidad y confianza— está enterrado en la sección separada "Chat IA" (`MechanicChat.tsx`). El mecánico no puede ver el diagnóstico y hacer follow-up en el mismo sitio. Además, el diagnóstico cognitivo se dispara **automáticamente** al entrar al vehículo (`DashboardPage`), gastando llamadas LLM (hasta 60 s cada una) incluso cuando el mecánico solo quiere ver los fallos crudos y ya sabe qué le pasa al coche.

## What Changes

- **Un solo apartado "Diagnóstico" (el chat)** que sustituye a las secciones separadas `diagnosis` y `chat` del sidebar. El output del LLM entra como primer mensaje del chat, con el input de follow-up debajo usando el MISMO contexto.
- **Diagnóstico IA a demanda**: se elimina el auto-disparo del diagnóstico cognitivo al entrar/confirmar vehículo. El mecánico revisa los fallos crudos (DTCs, datos en vivo, freeze frames, ECUs) y decide cuándo lanzar la IA desde un CTA dentro del chat. La recogida de fallos crudos (diagnóstico determinista) sigue en su sitio (`DiagnoseButton`).
- **Tres estados en el chat**: (a) vacío → CTA "Lanzar diagnóstico IA" + línea de contexto; (b) generando → spinner con texto descriptivo; (c) diagnóstico → output del LLM como primer mensaje + input de follow-up.
- **Regeneración con persistencia**: cada nueva diagnosis abre una `diagnosis_session` nueva (regenera el diagnóstico con el contexto nuevo); la conversación/diagnóstico anterior queda persistida ligada a su `diagnosis_session` y accesible en el historial.
- **Eliminación del panel "Diagnóstico IA" separado** (`DiagnosisPanel.tsx`). Se reutiliza la columna `diagnosis_session.result_json` (ya existente) para persistir el diagnóstico — **no se crea tabla nueva**.
- **Casos borde**: sin DTCs activos → permitir lanzar igual y que el LLM entregue un "resumen de salud"; sesión sin datos aún → CTA deshabilitado.

## Capabilities

### New Capabilities
- `diagnosis-chat`: apartado único "Diagnóstico" (el chat) con tres estados (vacío/CTA, generando, diagnóstico), lanzamiento de la IA a demanda, follow-up en el mismo contexto, regeneración por sesión, y manejo de casos borde (sin DTCs → resumen de salud; sin datos → CTA deshabilitado).

### Modified Capabilities
- `execute-cognitive-diagnosis`: el diagnóstico cognitivo se persiste ligado a su `diagnosis_session` reutilizando `result_json` (sin tabla nueva), el endpoint acepta `sessionId` opcional para encadenar follow-ups a la misma sesión, y devuelve `sessionId` para que el frontend mantenga el hilo.

## Impact

- **Eliminado**: `apps/ui/src/components/dashboard/DiagnosisPanel.tsx` (panel determinista separado).
- **Modificado (UI)**: `apps/ui/src/components/dashboard/MechanicChat.tsx` (3 estados + CTA), `DashboardSection.tsx` (una sola sección `diagnosis`), `DashboardPage.tsx` (quitar auto-disparo, orquestar lanzamiento a demanda), `Sidebar.tsx` (fusionar `diagnosis` + `chat`), `useCognitiveDiagnosis.ts` (mantener `sessionId` del hilo, reset por regeneración), `lib/api.ts` (enviar/recibir `sessionId`).
- **Modificado (API)**: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts` (schema Zod con `sessionId` opcional, devolver `sessionId`), `apps/core-api/src/infrastructure/services/diagnosisService.ts` (encadenar follow-ups a sesión existente, snapshot con conversación).
- **Tests**: unitarios en `apps/ui/tests/unit/` y `apps/core-api/tests/unit/`.
- **No se toca** el change activo `add-live-data-pid-selector` ni el schema de Drizzle (se reutiliza `result_json`).
