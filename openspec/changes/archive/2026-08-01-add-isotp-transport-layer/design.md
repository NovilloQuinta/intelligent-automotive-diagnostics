## Context

Fase 4 del TFM: diagnóstico cognitivo vehicular. Stack: TypeScript (ESM, strict), Express 5, Clean Architecture con factory functions, Vitest para testing. Este proyecto simula y diagnostica vehículos vía OBD-II. La lectura del VIN (Service 09 PID 02) produce 19 bytes de payload (SID + PID + 17 chars VIN), que exceden los 7 bytes de datos útiles de un Single Frame CAN (8 bytes total con PCI). ISO 15765-2 (ISO-TP) define el protocolo de segmentación/reassembly multi-frame para resolver esto.

Actualmente el simulador `ObdSimulator.getVin()` devuelve el string VIN directamente desde el escenario, saltándose completamente el protocolo CAN. El decoder `decodeVin()` existe pero ningún flujo de código lo invoca con bytes reales. La capa de transporte ISO-TP es el prerrequisito para que cualquier adaptador OBD (simulado o real) pueda leer el VIN correctamente.

Referencia: `docs/adr/004-elm327-emulador-docker.md` — menciona explícitamente "ISO-TP flow control" como capacidad objetivo de la futura implementación TypeScript `infrastructure/elm327-simulator/`.

## Goals / Non-Goals

**Goals:**
- Definir tipos de trama CAN ISO-TP: `SingleFrame`, `FirstFrame`, `FlowControl`, `ConsecutiveFrame` con enums y type guards.
- Implementar `parsePci(byte: number): FrameTypeInfo` — decodifica el PCI byte de cualquier trama CAN.
- Implementar `reassembleFrames(frames: CanFrame[]): number[]` — recibe frames CAN (con PCI) y reensambla el payload completo. Soporta Single Frame y Multi-Frame (FF → CFs). Valida secuencia, detecta overflow, maneja payloads de 1 a 4095 bytes.
- Implementar `segmentPayload(payload: number[], mtu?: number): CanFrame[]` — recibe un payload y lo segmenta en frames CAN (SF si cabe en uno, FF+CFs si requiere multi-frame).
- Tests unitarios con edge cases reales: VIN de 19 bytes (caso canónico), payload de 7 bytes (límite SF), payload de 8 bytes (fuerza FF+1CF), seq gap, overflow (>4095), timeout simulado.

**Non-Goals:**
- No se conecta a TCP, no habla ELM327 AT commands, no implementa `ObdRepositoryPort`.
- No modifica el simulador existente ni `decodeVin()`.
- No cablea el reassembler a ningún flujo de producción (eso va en un cambio futuro: `Elm327TcpRepository`).
- No implementa direccionamiento CAN (IDs 7E0/7E8) — eso es responsabilidad de la capa superior.

## Decisions

### 1. Módulo puro en `infrastructure/obd/isotp/` (no en `infrastructure/elm327-simulator/`)

**Elegido**: `infrastructure/obd/isotp/`. El ISO-TP es una capa de transporte agnóstica al medio (TCP, ELM327, CAN raw). Separarlo de `elm327-simulator` permite reutilizarlo tanto en el adaptador TCP como en un futuro simulador TypeScript puro. Sigue el patrón de `pidParser.ts` y `vinDecoder.ts`: funciones puras en `infrastructure/obd/`.

**Rechazado**: `infrastructure/elm327-simulator/` (ADR 004). Ese directorio se reserva para la implementación completa del protocolo ELM327 (AT commands + CAN + ISO-TP), que incluirá este módulo como dependencia.

### 2. Uint8Array sobre number[]

**Elegido**: `number[]` para la API pública (consistente con `pidParser.ts` y `vinDecoder.ts` que usan `number[]`). Internamente se usa `Uint8Array` donde convenga por claridad semántica. Los bytes son siempre 0-255.

**Rechazado**: `Buffer` de Node.js. El código debe ser portable sin dependencias de runtime Node.

### 3. Reassembly con mapa de frames por secuencia

**Elegido**: El reassembler recibe un array de frames y los procesa en orden. Usa un Map<sequenceNumber, frame> para tolerar frames fuera de orden (aunque CAN garantiza orden en el bus, el testing se simplifica). Valida gaps de secuencia como error.

**Rechazado**: Asumir orden estricto del array de entrada sin validación — frágil para testing y propenso a bugs silenciosos.

### 4. Segmentación sin Flow Control (modo emisor)

**Elegido**: `segmentPayload()` solo construye los frames de salida (SF o FF+CFs). No implementa la lógica de recepción de Flow Control porque la segmentación se usa para enviar requests (que casi siempre caben en SF). El Flow Control se implementa en el reassembler (lado receptor) y en un futuro `isotpSession` con estado.

**Rechazado**: Full ISO-TP session con state machine (envío + recepción + timers). Overkill para esta fase; el reassembler cubre el caso crítico (leer VIN).

### 5. PCI byte como bitmask (no string parsing)

**Elegido**: `parsePci(byte)` usa operaciones bitwise (`byte >> 4`, `byte & 0x0F`). Es el enfoque canónico de implementaciones ISO-TP y ~10x más rápido que convertir a hex string.

## Data Model

### FrameType enum & CanFrame
```typescript
enum FrameType {
  SINGLE = 0,       // PCI 0x0n
  FIRST = 1,        // PCI 0x1n
  CONSECUTIVE = 2,  // PCI 0x2n
  FLOW_CONTROL = 3, // PCI 0x3n
}

interface CanFrame {
  data: number[];   // 8 bytes: [PCI, payload...]
}

interface IsotpFrameInfo {
  type: FrameType;
  dataLength?: number;     // For SF: payload length (1-7). For FF: total length (8-4095)
  sequenceNumber?: number; // For CF: 1-15
  flowStatus?: number;     // For FC: 0=CTS, 1=WT, 2=Overflow
}
```

### parsePci
```typescript
function parsePci(byte: number): IsotpFrameInfo;
// Decodes the PCI byte of any CAN frame
// byte = 0x03 → { type: SINGLE, dataLength: 3 }
// byte = 0x10 → { type: FIRST, dataLength: (from next byte) }
// byte = 0x21 → { type: CONSECUTIVE, sequenceNumber: 1 }
// byte = 0x30 → { type: FLOW_CONTROL, flowStatus: 0 }
```

### reassembleFrames
```typescript
function reassembleFrames(frames: CanFrame[]): number[];
// Returns reassembled payload bytes (excluding PCI and FF length byte)
// Throws on: invalid sequence, overflow, missing FF, truncated payload
```

### segmentPayload
```typescript
function segmentPayload(payload: number[], mtu?: number): CanFrame[];
// MTU default: 8 (standard CAN). Splits payload into SF or FF+CFs
// Single Frame: 1 PCI byte + up to 7 payload bytes
// Multi-Frame: FF (2 overhead + 6 payload) + N × CF (1 overhead + 7 payload)
```

## Error Handling

| Error | Causa | Comportamiento |
|---|---|---|
| `IsotpSequenceError` | Gap en números de secuencia de CF (ej: 1, 2, 5) | Se lanza con el `expected` y `received` |
| `IsotpOverflowError` | Payload total > 4095 bytes | Se lanza al detectar FF con length > 4095 |
| `IsotpFrameError` | PCI byte inválido (0x40-0xFF) o frame sin datos | Se lanza con mensaje descriptivo |
| `IsotpTruncatedError` | Payload recibido < length declarado en FF | Se lanza al verificar total recibido vs esperado |
| Missing First Frame | CF sin FF previo | Se lanza `IsotpFrameError` |

## Risks / Trade-offs

- [No maneja CAN FD (64 bytes)] → CAN FD usa ISO 15765-2 con MTU mayor. Mitigación: el parámetro `mtu` en `segmentPayload` permite configurarlo; el reassembler asume MTU=8 por ahora.
- [No implementa timers ISO-TP (N_As, N_Bs, N_Cr)] → Los timeouts son responsabilidad del caller. Mitigación: el reassembler valida integridad estructural; el adapter TCP/ELM327 añadirá timeouts.
- [Segmenter sin Flow Control real] → Solo construye frames, no maneja la negociación BS/STmin. Mitigación: suficiente para requests (caben en SF); la sesión completa se implementa cuando se necesite enviar multi-frame.
