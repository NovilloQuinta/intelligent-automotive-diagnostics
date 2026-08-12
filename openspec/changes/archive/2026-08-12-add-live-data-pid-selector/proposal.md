## Why

Actualmente el dashboard de telemetría en vivo muestra siempre los mismos 4 PIDs fijos (rpm, refrigerante, velocidad, admisión) sin que el mecánico pueda elegir cuáles ver. Las máquinas de diagnosis profesionales permiten seleccionar PIDs arbitrarios según lo que interese en cada momento (temperatura de escape, presión del turbo, voltaje de batería, etc.).

Para un coche real, esta limitación es un problema: el mecánico necesita ver datos específicos según el síntoma. Además, el ELM327 real soporta multi-PID requests (`01 0C 0D 05 0F`) en un solo mensaje, pero nuestro `parseModeResponse()` solo captura la primera línea de respuesta y no procesa multi-frame.

**Contexto**: demo con coche real la semana del 10 de agosto por USB. Esto es post-demo.

## What

### 1. Multi-PID request al ELM327

- `readPids()` nuevo método en el repositorio que envía varios PIDs en un solo comando: `01 0C 0D 05 0F`
- Aprovecha el multi-frame que ya implementa `serialTransport.ts` (cola FIFO, delimitador `>`)
- Reduce de 4 comandos secuenciales (~400ms) a 1 comando (~100ms)

### 2. Parseo multi-frame en protocol.ts

- `parseModeResponse()` ampliado para manejar respuestas multi-línea `0:`, `1:`, `2:` como ya hace `parseVinResponse()` para Mode 09
- Mismo patrón, sin duplicar lógica

### 3. Endpoint dinámico de live data

- `GET /api/live-data?pids=0C,0D,05,0F` acepta query param `pids` (lista separada por comas, con los 4 actuales como default)
- Validación Zod: PIDs válidos Mode 01, contra catálogo `ALL_SEED_PIDS`
- Si `pids` no se pasa, comportamiento actual (los 4 fijos)

### 4. UI: selector de PIDs

- `PidsTable` gana checkboxes para marcar qué PIDs van a telemetría en vivo
- `TelemetrySection` renderiza dinámicamente las gauges según selección (no solo 4 fijos)
- `useLiveTelemetry` acepta array de PIDs seleccionados
- Switch en TopBar para activar/desactivar el modo "selección personalizada" vs los 4 por defecto

### 5. Degradación y UX

- Si el coche no soporta un PID seleccionado, ese gauge muestra `—`
- Máximo de PIDs simultáneos: 8 (razonable para 1 Hz sin saturar)
- Los 4 PIDs originales siempre visibles como mínimo

## Lo que NO cambia

- La cadencia 1 Hz se mantiene
- Los 4 PIDs por defecto siguen siendo los mismos
- `serialTransport.ts` no se toca (ya soporta multi-command vía cola FIFO)
- El endpoint `GET /api/live-data` sin query param mantiene compatibilidad hacia atrás

## Capabilities

### Added
- `live-data-pid-selector`: el mecánico elige qué PIDs ver en tiempo real

## Impact

- **Modificado**: `apps/core-api/src/infrastructure/elm327/protocol.ts` (parseModeResponse multi-frame)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (readPids)
- **Modificado**: `apps/core-api/src/application/ports/ObdRepository.ts` (readPids)
- **Modificado**: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (getLiveData con pids param)
- **Modificado**: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts` (liveData query schema)
- **Modificado**: `apps/ui/src/components/dashboard/useLiveTelemetry.ts` (pids dinámicos)
- **Modificado**: `apps/ui/src/components/dashboard/TelemetrySection.tsx` (gauges dinámicos)
- **Modificado**: `apps/ui/src/components/dashboard/PidsTable.tsx` (checkboxes)
- **Sin cambios**: `serialTransport.ts`, `tcpTransport.ts`, `Elm327Transport.ts`
