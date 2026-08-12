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

**D7. Respuesta genérica: `readings` (añadido en implementación)**
- La spec exige "cada PID Mode 01 muestra un checkbox", no solo los 4 con gauge dedicado.
- El simulador solo modela 7 PIDs (4 por `sensorValues` + acelerador/load/voltaje por `pidValues`);
  un ELM327 real lee los 16 Mode 01 del catálogo `ALL_SEED_PIDS` vía fórmula.
- **Decisión**: `getLiveData` devuelve, además de los 4 campos nombrados (backward compat),
  un array `readings: { code, name, unit, value }[]` enriquecido desde `ALL_SEED_PIDS`
  para TODOS los PIDs solicitados. Los 4 con gauge dedicado usan sus componentes; el resto
  se renderiza con un gauge genérico (nombre + valor + unidad).

**D8. Simulador con datos para los 16 Mode 01 (añadido en implementación)**
- Para que la verificación manual y la UI cubran el catálogo completo, el simulador genera
  valores plausibles para los 16 PIDs Mode 01, no solo los 7 actuales.
- **Decisión**: extender `seedScenarios`/`readPidValue` para los 16 Mode 01; los PIDs sin
  sensor explícito usan un valor derivado estable (no aleatorio) para no romper TDD.

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
