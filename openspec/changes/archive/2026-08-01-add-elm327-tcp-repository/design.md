## Context

Fase 4 del TFM. Stack: TypeScript ESM strict, Express 5, Clean Architecture, Vitest. El proyecto tiene dos "mundos" OBD desconectados: (a) un simulador in-process (`ObdSimulator` + `ObdSimulatorRepository`) que usa escenarios hardcodeados, y (b) un emulador ELM327 Python corriendo en Docker con ~25 PIDs SAE + 16 DIDs VAG Mode 22. El `.env.example` documenta `OBD_MODE=tcp` pero no hay código que lo implemente.

Verificación empírica con `nc` confirmó:
- Respuesta ELM327 sin headers por defecto: `41 0C 0C 80 \r\r>`
- Mode 22 UDS responde: `62 11 30 0C 80` (SID 62 + DID echo + payload)
- Mode 09 02 devuelve VIN multi-línea con prefijo `N:`
- Mode 03 devuelve `NO DATA` (no definido en escenario)
- Conexiones TCP efímeras: AT state no persiste entre conexiones

## Goals / Non-Goals

**Goals:**
- Implementar `Elm327TcpRepository` que cumpla `ObdRepositoryPort` completo.
- Leer VIN dinámicamente del emulador (sin hardcodear) y extraer `VehicleInfo` (make + year) vía WMI registry expandido + model year table.
- Soportar Mode 01, Mode 22 VAG, Mode 09 02, Mode 03, Mode 02 con parseo robusto.
- Inyectar el adaptador en `main.ts` controlado por `OBD_MODE=tcp`.
- Adaptar `diagnosis.routes.ts` para aceptar `obdRepo?` como alternativa a `scenarios`.
- Añadir Mode 03 y Mode 02 al escenario Python para diagnóstico completo.
- TDD estricto: RED (mock TCP) → GREEN → REFACTOR.

**Non-Goals:**
- No implementa ISO 15765-4 (direccionamiento CAN 7E0/7E8) — el emulador ya lo abstrae.
- No maneja protocolos ELM327 avanzados (AT commands más allá de los defaults).
- No implementa connection pooling ni keep-alive — conexiones efímeras son suficientes.
- No soporta CAN FD (MTU 64) — el emulador usa CAN estándar.

## Decisions

### 1. Conexión efímera por comando (no persistente)

**Elegido**: Abrir/cerrar socket TCP por cada llamada a `sendCommand()`. Verificación empírica: el AT state no persiste entre conexiones, headers off es el default. Timeout 3s por comando. Patrón consistente con `scripts/send-obd.ts`.

**Rechazado**: Conexión persistente con reconnect. Más compleja, no aporta beneficio real (el emulador no soporta pipelining), introduce riesgo de estado inconsistente.

### 2. Parseo sin headers (AT H0 por defecto)

**Elegido**: Asumir `AT H0` (sin headers CAN en respuesta). El emulador arranca en este modo por defecto. Respuesta: `41 XX [data]`. Si aparecen headers, se ignoran (regex busca `41` en cualquier posición).

**Rechazado**: Enviar `AT H0` explícito. Innecesario (es el default), añade un round-trip extra por comando.

### 3. Fórmulas desde STANDARD_MODE_01_PIDS + evaluatePid

**Elegido**: Construir un `Map<string, {formula, dataBytes}>` desde `STANDARD_MODE_01_PIDS` (seed-pids.ts) en el constructor. Aplicar `evaluatePid(formula, bytes)` para convertir bytes crudos a valor físico. Para Mode 22 VAG, añadir fórmulas específicas (misma lógica que SAE para RPM/coolant/speed).

**Rechazado**: Hardcodear fórmulas en el adapter. Duplicaría la fuente de verdad (seed-pids.ts ya las tiene).

### 4. VIN → VehicleInfo desde domain Vin (no en el adapter)

**Elegido**: Expandir la clase `Vin` con `manufacturer()` (WMI registry ampliado con marcas) y `modelYear()` (posición 10, ISO 3779 table). El adapter lee VIN → `Vin.create(vin)` → `vin.manufacturer()` + `vin.modelYear()` → `VehicleInfo`. Modelo/engine quedan como "unknown".

**Rechazado**: Lógica de decodificación en el adapter. Rompería la cohesión del domain; el WMI registry ya existe en `Vin`.

### 5. Mode 03 + Mode 02 en el escenario Python

**Elegido**: Añadir entradas al diccionario `ObdMessage` en `audi_a3_tdi.py` para Mode 03 (DTCs: P0301 cylinder misfire, P0401 EGR flow, P2002 DPF efficiency) y Mode 02 (freeze frame para el primer DTC con valores de sensores relevantes).

**Rechazado**: Dejar Mode 03 sin definir y manejar `NO DATA` como DTCs vacíos. Poco realista para un test de diagnóstico.

## Data Model

### ELM327 Response Parser

```
Response format (Mode 01, AT H0):
  "01 0C\r41 0C 0C 80 \r\r>"
  └─ echo ─┘└── data ──┘└prompt┘

Parsed: "41 0C 0C 80"
  ├─ 41: mode + 0x40 (response indicator)
  ├─ 0C: PID echoed
  └─ 0C 80: data bytes (2 bytes for RPM)

Response format (Mode 22, AT H0):
  "62 11 30 0C 80"
  ├─ 62: SID + 0x40
  ├─ 11 30: DID echoed
  └─ 0C 80: data bytes

Response format (Mode 09 02, VIN):
  "014\n0: 49 02 01 57 50 30 \n1: 5A ..."
  ├─ 014: line count/size header
  ├─ N:: line prefix
  ├─ 49 02 01: mode, pid, count
  └─ rest: ASCII hex bytes for 17-char VIN

Response format (Mode 03):
  "43 03 01 04 01 20 02 00 00"
  ├─ 43: mode + 0x40
  └─ pairs: [03,01]=P0301, [04,01]=P0401, [20,02]=P2002
  DTC decode: byte1>>6=category, (byte1>>4)&3=digit1,
              byte1&0xF=digit2, byte2>>4=digit3, byte2&0xF=digit4
```

### Vin expansions

```typescript
// WMI_MANUFACTURER_REGISTRY: Array<[RegExp, string]>
// [/^WAU/, "Audi"], [/^WUA/, "Audi"], [/^WVW/, "Volkswagen"],
// [/^WBA/, "BMW"], [/^WDD/, "Mercedes-Benz"],
// [/^VF3/, "Peugeot"], [/^JKA/, "Kawasaki"],
// [/^JTD/, "Toyota"], [/^1G1/, "Chevrolet"], ...

Vin.manufacturer(): string | null
  → busca en WMI_MANUFACTURER_REGISTRY por código WMI (primeros 3 chars)

Vin.modelYear(): number | null
  → posición 10 del VIN, tabla ISO 3779:
    A=1980, B=1981, ..., Y=2000, 1=2001, ..., 9=2009,
    A=2010, ..., Y=2030 (excluye I,O,Q,U,Z,0)
```

### Elm327TcpRepository interface

```typescript
class Elm327TcpRepository implements ObdRepositoryPort {
  constructor(config: { host: string; port: number; timeout?: number })

  // TCP
  private sendCommand(cmd: string): Promise<string>

  // Parsers
  private parseModeResponse(raw: string): number[]
  private parseMode22Response(raw: string, didLen: number): number[]
  private parseVinResponse(raw: string): number[]
  private parseDtcResponse(raw: string): Array<[number, number]>
  private decodeDtc(byte1: number, byte2: number): string

  // Formula engine
  private readonly pidFormulas: Map<string, { formula: string; dataBytes: number }>
  private applyPidFormula(mode: string, pid: string, bytes: number[]): number

  // ObdRepositoryPort
  readPid(mode, pid)            → send → parse → applyFormula
  readDtcCodes()                 → send "03" → parse → decode
  readVin()                      → send "09 02" → parseVinResponse
  getFreezeFrame(dtc?)           → send "02 XX" → parse
  getVehicleInfo()               → readVin → vin.manufacturer + vin.modelYear
  getSupportedPids()             → send "01 00" → bitmask parse
  clearDtcCodes()                → send "04" → void
  setPower(on)                   → no-op
}
```

## Error Handling

| Error | Causa | Comportamiento |
|---|---|---|
| `Elm327ConnectionError` | ECONNREFUSED, timeout, socket error | Se lanza con host:port y mensaje descriptivo |
| `Elm327NoDataError` | PID/DTC no soportado por el emulador | Se lanza con el comando enviado |
| `Elm327ParseError` | Respuesta ELM327 ilegible/malformada | Se lanza con el raw recibido |
| Timeout (3s) | Emulador no responde | Se lanza `Elm327ConnectionError` |
| VIN inválido | El emulador devuelve VIN que no pasa `Vin.create()` | `getVehicleInfo()` retorna make="unknown", year=0 |

## Risks / Trade-offs

- [Conexión efímera = 3 TCP handshakes por diagnóstico] → 4 PIDs + DTCs + freeze frame = 6 conexiones TCP. Overhead despreciable en localhost (<1ms por handshake).
- [Mode 03 requiere modificar el escenario Python] → Cambio pequeño y aislado en `audi_a3_tdi.py`. Si el escenario no se actualiza, el adapter devuelve DTCs vacíos (diagnóstico funcional pero sin fallos).
- [Mode 22 fórmulas incompletas] → Solo se añaden fórmulas para los DIDs VAG del escenario actual (RPM, coolant, boost, fuel rail, DPF, battery). DIDs desconocidos devuelven raw big-endian int.
