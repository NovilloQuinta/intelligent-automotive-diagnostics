## Architecture

### Multi-PID request flow

```
UI (PidsTable checkboxes)
  → useLiveTelemetry(selectedId, ['0C', '0D', '05'])
    → GET /api/live-data?scenarioId=audi&pids=0C,0D,05
      → DiagnosisService.getLiveData(scenarioId, ['0C', '0D', '05'])
        → repository.readPids('01', ['0C', '0D', '05'])
          → elm327Adapter.sendCommand('01 0C 0D 05')
            → serialTransport.sendCommand('01 0C 0D 05\r\n')
              → ELM327 responde:
                  0: 41 0C 0C 80
                  1: 41 0D 5A
                  2: 41 05 50
                  >
              → parseModeResponse(raw) → Map { '0C' => 750, '0D' => 90, '05' => 50 }
```

### Decisiones

**D1. Multi-PID en un solo comando vs 4 comandos separados**
- Un solo `sendCommand('01 0C 0D 05 0F')` vs 4 llamadas `sendCommand('01 0C')`, `sendCommand('01 0D')`, etc.
- Con serial transport: un comando tarda ~100ms vs 4 comandos ~400ms (cola FIFO secuencial)
- Con TCP: similar ventaja
- **Decisión**: un solo comando multi-PID. El ELM327 lo soporta nativamente.

**D2. parseModeResponse multi-frame: reutilizar patrón de parseVinResponse**
- `parseVinResponse` ya itera líneas `N:` y `0:`..`N:` para Mode 09 02
- Mismo patrón para Mode 01 respuestas multi-línea: `0: 41 XX YY`, `1: 41 XX YY`
- **Decisión**: extraer helper `parseMultiLineResponse(raw, linePrefix)` usado por ambos, sin duplicar.

**D3. Degradación por PID individual en multi-PID response**
- Si un PID responde `NO DATA` en una línea, los demás PIDs siguen siendo válidos
- El PID fallido se omite del Map (llega `null` al gauge → muestra `—`)
- **Decisión**: `readPids` itera líneas individualmente con try/catch por línea, no por comando entero.

**D4. Endpoint con query param opcional → compatibilidad hacia atrás**
- `GET /api/live-data?scenarioId=X` → 4 PIDs por defecto (comportamiento actual)
- `GET /api/live-data?scenarioId=X&pids=0C,0D,05` → solo esos PIDs
- **Decisión**: query param opcional, Zod valida, sin romper API existente.

**D5. UI: checkboxes en PidsTable, no selector aparte**
- `PidsTable` ya lista todos los PIDs Mode 01 leídos en el diagnóstico
- Añadir columna de checkbox es mínima intrusión
- **Decisión**: prop `selectable: boolean` + `onPidsChange(pids: string[])` en PidsTable, sin componente nuevo.

**D6. Límite de 8 PIDs simultáneos**
- Con 8 PIDs a 1 Hz, el ELM327 tiene ~800ms de margen (8 PIDs * ~100ms = ~800ms, margen ~200ms)
- Más de 8 PIDs a 1 Hz no drena la cola
- **Decisión**: validación Zod `pids.max(8)` en el endpoint.

### Capas Clean Architecture

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Domain | `pids.ts` | Constantes DEFAULT_LIVE_PIDS, MODE_CURRENT_DATA |
| Application | `ObdRepository.ts` | Puerto `readPids(mode, pids)` |
| Infrastructure | `elm327Adapter.ts` | `readPids`: comando multi-PID → Map |
| Infrastructure | `protocol.ts` | `parseModeResponse` multi-frame |
| Infrastructure | `diagnosisService.ts` | `getLiveData` con PIDs dinámicos |
| Infrastructure | `DiagnosisController.ts` | `liveData` con query schema `pids` |
| UI | `PidsTable.tsx` | Checkboxes + `onPidsChange` |
| UI | `TelemetrySection.tsx` | Gauges dinámicos según `pids` prop |
| UI | `useLiveTelemetry.ts` | Hook con `pids` param → query key |
