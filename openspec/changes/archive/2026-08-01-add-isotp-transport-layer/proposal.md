## Why

El proyecto carece de capa de transporte ISO 15765-2 (ISO-TP) para CAN Bus. Actualmente el simulador (`ObdSimulator`) devuelve el VIN como string directo sin pasar por CAN frames, y el decoder `decodeVin()` es código muerto sin ningún flujo de producción que le pase bytes. La lectura real de VIN (Service 09 PID 02, 19 bytes de payload) requiere ISO-TP multi-frame porque un Single Frame CAN solo transporta 7 bytes de datos útiles. Sin ISO-TP, el sistema no puede leer el VIN de un vehículo real ni validar el comportamiento de multi-frame contra el emulador ELM327 Docker.

## What Changes

- **Nuevo módulo ISO-TP puro** (`infrastructure/obd/isotp/`): definición de tipos de trama CAN, parser/builder de PCI byte, reassembler (frames → payload) y segmenter (payload → frames).
- **Zero dependencias externas**: funciones puras que operan sobre `number[]` y `Uint8Array`. Sin I/O, sin TCP, sin ELM327.
- **Tests unitarios completos** con TDD estricto cubriendo edge cases: timeout (seq gap), overflow, single frame, payload vacío, límites exactos de MTU.
- **Cero cambios en el simulador, puertos, o rutas existentes** — el módulo es autocontenido y se cablea en un cambio futuro.

## Capabilities

### New Capabilities
- `isotp-transport`: Reassembly y segmentación ISO 15765-2 sobre CAN Bus. Soporta Single Frame, First Frame, Flow Control y Consecutive Frames con validación de secuencia, detección de overflow, y manejo de timeouts.

## Impact

- Nuevo: `apps/core-api/src/infrastructure/obd/isotp/frameTypes.ts`
- Nuevo: `apps/core-api/src/infrastructure/obd/isotp/reassembler.ts`
- Nuevo: `apps/core-api/src/infrastructure/obd/isotp/segmenter.ts`
- Nuevo: `apps/core-api/src/infrastructure/obd/isotp/index.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/obd/isotp/reassembler.test.ts`
- Nuevo: `apps/core-api/tests/unit/infrastructure/obd/isotp/segmenter.test.ts`
- Sin cambios en dominio, application, puertos, rutas, simulador ni use cases existentes.
- Nuevo: `docs/adr/008-isotp-transport-layer.md`
