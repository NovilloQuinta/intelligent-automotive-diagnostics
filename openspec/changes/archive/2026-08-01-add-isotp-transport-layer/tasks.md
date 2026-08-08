## 1. ADR 008 — Documentar la decisión

- [x] 1.1 Crear `docs/adr/008-isotp-transport-layer.md` documentando:
  - Contexto: VIN requiere multi-frame, gap actual en el proyecto.
  - Decisión: implementar ISO-TP como módulo puro en `infrastructure/obd/isotp/`.
  - Alternativas consideradas: delegar al ELM327 Python, biblioteca externa.
  - Consecuencias: prerrequisito para `Elm327TcpRepository` y simulador TypeScript.

## 2. Tipos de trama — frameTypes.ts (TDD)

- [x] 2.1 RED: Escribir `tests/unit/infrastructure/obd/isotp/frameTypes.test.ts`:
  - `parsePci(0x03)` → `{ type: SINGLE, dataLength: 3 }`
  - `parsePci(0x07)` → `{ type: SINGLE, dataLength: 7 }`
  - `parsePci(0x10)` → `{ type: FIRST }` (dataLength viene del 2º byte)
  - `parsePci(0x1F)` → `{ type: FIRST }` (upper nibble de 12-bit length)
  - `parsePci(0x21)` → `{ type: CONSECUTIVE, sequenceNumber: 1 }`
  - `parsePci(0x2F)` → `{ type: CONSECUTIVE, sequenceNumber: 15 }`
  - `parsePci(0x30)` → `{ type: FLOW_CONTROL, flowStatus: 0 }`
  - `parsePci(0x32)` → `{ type: FLOW_CONTROL, flowStatus: 2 }` (overflow)
  - `parsePci(0x40)` → lanza `IsotpFrameError` (PCI inválido)
  - `buildPci({ type: SINGLE, dataLength: 3 })` → `0x03`
  - `buildPci({ type: FIRST })` → `0x10`
  - `buildPci({ type: CONSECUTIVE, sequenceNumber: 5 })` → `0x25`
  - `buildPci({ type: FLOW_CONTROL, flowStatus: 0 })` → `0x30`
- [x] 2.2 GREEN: Implementar `src/infrastructure/obd/isotp/frameTypes.ts`:
  - `FrameType` enum, `IsotpFrameInfo` interface, `CanFrame` interface.
  - `parsePci(byte)` con bitwise operations.
  - `buildPci(info)` — inversa de parsePci.
  - Clases de error: `IsotpFrameError`, `IsotpSequenceError`, `IsotpOverflowError`, `IsotpTruncatedError`.
- [x] 2.3 REFACTOR: TSDoc en todos los exports públicos, extraer constantes mágicas.

## 3. Reassembler — reassembleFrames (TDD)

- [x] 3.1 RED: Escribir `tests/unit/infrastructure/obd/isotp/reassembler.test.ts`:
  - **Single Frame (7 bytes)**: SF con PCI `0x07` + 7 bytes payload → devuelve los 7 bytes.
  - **Single Frame (3 bytes)**: SF con PCI `0x03` + 3 bytes payload (caso mínima request).
  - **VIN multi-frame (19 bytes)**: FF (PCI `0x10` + length `0x13` + 6 bytes) + CF seq1 (7 bytes) + CF seq2 (7 bytes) → 19 bytes reensamblados. (Caso canónico: Service 09 PID 02)
  - **Payload de 8 bytes (fuerza FF+1CF)**: 1 byte excede SF → FF con 6 bytes + CF seq1 con 2 bytes → 8 bytes.
  - **Seq gap**: CF seq1, seq3 (falta seq2) → lanza `IsotpSequenceError`.
  - **Seq wraparound**: seq 15 → seq 1 (rollover válido, no es gap).
  - **Overflow**: FF declara length > 4095 → lanza `IsotpOverflowError`.
  - **Truncado**: FF declara 20 bytes pero solo llegan 10 → lanza `IsotpTruncatedError`.
  - **CF sin FF previo**: solo CF frames → lanza `IsotpFrameError`.
  - **Frame con PCI inválido**: byte `0x40` → lanza `IsotpFrameError`.
  - **Array vacío**: `reassembleFrames([])` → lanza error.
  - **Dos Single Frames**: solo se permite uno; el segundo → error.
- [x] 3.2 GREEN: Implementar `src/infrastructure/obd/isotp/reassembler.ts`:
  - `reassembleFrames(frames: CanFrame[]): number[]`
  - Detectar SF vs FF por PCI byte.
  - Para FF: extraer total length de bytes 0-1, acumular payloads de CFs por seq number.
  - Validar integridad (seq contigua, longitud coincidente, sin overflow).
  - Devolver payload reensamblado (sin bytes de control).
- [x] 3.3 REFACTOR: TSDoc, extraer función interna `validateSequence`.

## 4. Segmenter — segmentPayload (TDD)

- [x] 4.1 RED: Escribir `tests/unit/infrastructure/obd/isotp/segmenter.test.ts`:
  - **Payload de 3 bytes** → 1 Single Frame: PCI `0x03` + 3 bytes.
  - **Payload de 7 bytes (límite SF)** → 1 Single Frame: PCI `0x07` + 7 bytes.
  - **Payload de 8 bytes (fuerza FF)** → FF (PCI `0x10` + `0x08` + 6 bytes) + CF seq1 (PCI `0x21` + 2 bytes).
  - **Payload de 19 bytes (VIN)** → FF (6 bytes) + CF seq1 (7 bytes) + CF seq2 (6 bytes). Longitud total `0x13` en FF.
  - **Payload de 20 bytes** → FF (6 bytes) + CF seq1 (7 bytes) + CF seq2 (7 bytes). Longitud total `0x14`.
  - **Payload de 4095 bytes** → FF + 584 CFs. Seq numbers: 1..15, 1..15, ...
  - **Payload de 4096 bytes** → lanza `IsotpOverflowError`.
  - **Payload vacío** → lanza error.
  - **MTU personalizado (16 bytes)**: SF hasta 15 bytes de payload, FF con 14 bytes iniciales, etc.
- [x] 4.2 GREEN: Implementar `src/infrastructure/obd/isotp/segmenter.ts`:
  - `segmentPayload(payload: number[], mtu?: number): CanFrame[]`
  - Si payload.length <= mtu - 1: Single Frame.
  - Sino: First Frame + N × Consecutive Frames con seq numbers 1..15 wraparound.
  - Validar longitud máxima (4095).
- [x] 4.3 REFACTOR: TSDoc, extraer `computeFrameCount`.

## 5. Barrel export + verificaciones

- [x] 5.1 Crear `src/infrastructure/obd/isotp/index.ts` con barrel exports de frameTypes, reassembler, segmenter.
- [x] 5.2 Ejecutar `pnpm lint && pnpm format && pnpm test && pnpm build` desde raíz.
- [x] 5.3 Ejecutar `pnpm test:coverage` — nuevos archivos >= 80% statements/lines, 100% branches (funciones puras).
- [x] 5.4 Verificar que no hay imports circulares ni violaciones de capas (Clean Architecture: isotp no depende de domain, application, ni http).
- [x] 5.5 Actualizar `AGENTS.md` con estado de sesión.
