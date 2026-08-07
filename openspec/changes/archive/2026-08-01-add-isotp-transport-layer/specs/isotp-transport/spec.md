## ADDED Requirements

### Requirement: Definición de tipos de trama CAN ISO-TP
El sistema SHALL definir en `infrastructure/obd/isotp/frameTypes.ts` los tipos `FrameType`, `CanFrame`, `IsotpFrameInfo` y las funciones `parsePci()` y `buildPci()` para codificar/decodificar el byte PCI de tramas ISO 15765-2.

#### Scenario: Parse de Single Frame
- **WHEN** se invoca `parsePci(0x05)`
- **THEN** devuelve `{ type: FrameType.SINGLE, dataLength: 5 }`

#### Scenario: Parse de First Frame
- **WHEN** se invoca `parsePci(0x1A)`
- **THEN** devuelve `{ type: FrameType.FIRST }` (el dataLength completo se extrae de los bytes 0-1 del frame)

#### Scenario: Parse de Consecutive Frame
- **WHEN** se invoca `parsePci(0x23)`
- **THEN** devuelve `{ type: FrameType.CONSECUTIVE, sequenceNumber: 3 }`

#### Scenario: Parse de Flow Control
- **WHEN** se invoca `parsePci(0x30)`
- **THEN** devuelve `{ type: FrameType.FLOW_CONTROL, flowStatus: 0 }`

#### Scenario: Build de Single Frame PCI
- **WHEN** se invoca `buildPci({ type: FrameType.SINGLE, dataLength: 4 })`
- **THEN** devuelve `0x04`

#### Scenario: PCI byte inválido
- **WHEN** se invoca `parsePci(0x40)`
- **THEN** lanza `IsotpFrameError` con mensaje descriptivo

---

### Requirement: Reassembly de payload multi-frame ISO-TP
El sistema SHALL implementar `reassembleFrames(frames)` en `infrastructure/obd/isotp/reassembler.ts` que reciba un array de `CanFrame` y devuelva el payload reensamblado como `number[]`, manejando Single Frame, First Frame + Consecutive Frames, y validando integridad de secuencia.

#### Scenario: VIN de 19 bytes en multi-frame
- **WHEN** se pasan 3 frames CAN: un First Frame (longitud=19, 6 bytes payload) y dos Consecutive Frames (seq 1 y 2, 7+6 bytes payload)
- **THEN** se devuelve un `number[]` de 19 elementos con el payload completo
- **AND** los bytes de control (PCI, length) no aparecen en el resultado

#### Scenario: Single Frame de 3 bytes
- **WHEN** se pasa un único CanFrame con PCI `0x03` y 3 bytes de payload
- **THEN** se devuelven los 3 bytes sin el byte PCI

#### Scenario: Gap en secuencia de Consecutive Frames
- **WHEN** se pasa FF + CF seq1 + CF seq3 (falta seq2)
- **THEN** se lanza `IsotpSequenceError` indicando el número esperado y el recibido

#### Scenario: Overflow (payload > 4095 bytes)
- **WHEN** el First Frame declara una longitud total mayor a 4095
- **THEN** se lanza `IsotpOverflowError`

#### Scenario: Payload truncado
- **WHEN** el First Frame declara 20 bytes pero los Consecutive Frames solo entregan 10 bytes
- **THEN** se lanza `IsotpTruncatedError`

---

### Requirement: Segmentación de payload en frames CAN ISO-TP
El sistema SHALL implementar `segmentPayload(payload, mtu?)` en `infrastructure/obd/isotp/segmenter.ts` que reciba un payload como `number[]` y devuelva un array de `CanFrame` segmentado según ISO 15765-2.

#### Scenario: Payload de 3 bytes (Single Frame)
- **WHEN** se invoca `segmentPayload([0x09, 0x02, 0x00])` con MTU=8
- **THEN** devuelve un array con 1 CanFrame: PCI `0x03` + 3 bytes payload

#### Scenario: Payload de 8 bytes (fuerza First Frame)
- **WHEN** se invoca `segmentPayload([...8 bytes...])` con MTU=8
- **THEN** devuelve 2 frames: FF (PCI + length + 6 bytes) + CF seq1 (PCI + 2 bytes)

#### Scenario: VIN de 19 bytes
- **WHEN** se invoca `segmentPayload([...19 bytes...])` con MTU=8
- **THEN** devuelve 3 frames: FF (6 bytes) + CF seq1 (7 bytes) + CF seq2 (6 bytes)

#### Scenario: Rollover de secuencia
- **WHEN** se segmenta un payload de 200 bytes (requiere >15 CFs)
- **THEN** los números de secuencia siguen el patrón 1..15, 1..15 sin gaps

#### Scenario: Payload excede 4095 bytes
- **WHEN** se invoca `segmentPayload` con más de 4095 bytes
- **THEN** se lanza `IsotpOverflowError`

#### Scenario: Payload vacío
- **WHEN** se invoca `segmentPayload([])`
- **THEN** se lanza error de validación
