## Why

El sistema tiene un modo `OBD_MODE=tcp` documentado en `.env.example` pero no implementado: no existe `Elm327TcpRepository` ni ningún adaptador que implemente `ObdRepositoryPort` sobre TCP. El emulador ELM327 Docker (`:35000`, escenario `audi-a3-tdi`) está corriendo y responde a comandos Mode 01, Mode 22 (VAG UDS) y Mode 09 (VIN), pero la API HTTP solo sabe hablar con el simulador in-process (`sync`). Sin el adaptador TCP, no se puede probar el flujo real de diagnóstico contra un vehículo emulado con PIDs reales.

Verificación empírica (explore mode, `nc localhost 35000`):
- Mode 01 funciona: `01 0C` → `41 0C 0C 80` (800 RPM)
- Mode 22 VAG funciona: `22 11 30` → `62 11 30 0C 80` (VAG RPM)
- Mode 09 02 funciona: VIN multi-línea decodificado correctamente
- Mode 03: `NO DATA` — el escenario audi_a3_tdi.py no tiene DTCs definidos

## What Changes

- **Nuevo `Elm327TcpRepository`** (`infrastructure/obd/elm327TcpRepository.ts`): adaptador que implementa `ObdRepositoryPort` vía TCP al emulador ELM327. Conexión efímera por comando, parseo ELM327, aplicación de fórmulas SAE J1979.
- **Expansión del domain `Vin`**: métodos `manufacturer()` (WMI registry ampliado) y `modelYear()` (posición 10 ISO 3779) para extraer `VehicleInfo` del VIN leído dinámicamente.
- **Inyección dual-mode en `main.ts`**: cuando `OBD_MODE=tcp`, crea `Elm327TcpRepository` y lo inyecta al server; cuando `sync`, usa los escenarios + simulador existentes.
- **Routes diagnosis adaptadas**: `POST /diagnosis` y `POST /mcp/tools/:toolName` aceptan `obdRepo?` opcional para saltar la búsqueda de escenario en modo TCP.
- **Modificación del escenario Python**: añadir Mode 03 (DTCs: P0301 cylinder misfire + P0401 EGR + P2002 DPF) y Mode 02 (freeze frame) a `docker/elm327/scenarios/audi_a3_tdi.py`.

## Capabilities

### New Capabilities
- `elm327-tcp-repository`: Adaptador OBD-II sobre TCP para el emulador ELM327. Implementa `ObdRepositoryPort` completo (Mode 01, 03, 09, 22, freeze frame). Parseo de respuestas ELM327 (sin headers), aplicación de fórmulas SAE J1979 + VAG, decodificación DTC SAE J2012, y extracción de VehicleInfo desde VIN dinámico.

### Modified Capabilities
- `vin-domain`: Se expande con `manufacturer()` y `modelYear()` para enriquecer la decodificación de VIN.

## Impact

- Nuevo: `apps/core-api/src/infrastructure/obd/elm327TcpRepository.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/obd/elm327TcpRepository.test.ts`
- Modificado: `apps/core-api/src/domain/vin.ts` (WMI registry + manufacturer + modelYear)
- Modificado: `apps/core-api/tests/unit/domain/vin.test.ts`
- Modificado: `apps/core-api/src/main.ts` (dual-mode OBD)
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (+obdRepo dep)
- Modificado: `apps/core-api/src/infrastructure/http/routes/diagnosis.routes.ts` (+obdRepo dep)
- Modificado: `apps/core-api/tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts`
- Modificado: `apps/core-api/tests/unit/infrastructure/http/server.test.ts`
- Modificado: `docker/elm327/scenarios/audi_a3_tdi.py` (añadir Mode 03 + Mode 02)
