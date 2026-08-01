## 1. Expandir Vin domain — manufacturer + modelYear (TDD)

- [x] 1.1 RED: Añadir tests en `tests/unit/domain/vin.test.ts`:
  - `vin.manufacturer()`: WAU → "Audi", JKA → "Kawasaki", WVW → "Volkswagen", WMI desconocido → null
  - `vin.modelYear()`: posición 10 = "J" → 2018, "L" → 2020, "A" → 2010, "5" → 2005, inválido → null
  - Varios VINs cubriendo marcas europeas, japonesas, americanas
- [x] 1.2 GREEN: Expandir `src/domain/vin.ts`:
  - `WMI_MANUFACTURER_REGISTRY`: ~20 entradas (VAG, BMW, Mercedes, Stellantis, Toyota, Honda, Kawasaki, Ford, GM)
  - `Vin.manufacturer` getter
  - `MODEL_YEAR_TABLE`: mapeo char → year (ISO 3779, 1980-2030, excluye I/O/Q/U/Z/0)
  - `Vin.modelYear` getter
- [x] 1.3 REFACTOR: Verificar que tests existentes no rompen (24 tests de vin.test.ts)

## 2. RED — Tests Elm327TcpRepository con mock TCP

- [x] 2.1 Crear `tests/unit/infrastructure/obd/elm327TcpRepository.test.ts` con `vi.mock('node:net')`:
  - **readPid Mode 01 RPM**: mock TCP responde `"41 0C 0C 80"` → `readPid("01","0C")` devuelve 800
  - **readPid Mode 01 Coolant**: mock responde `"41 05 82"` → `readPid("01","05")` devuelve 90
  - **readPid Mode 01 Speed**: mock responde `"41 0D 00"` → `readPid("01","0D")` devuelve 0
  - **readPid Mode 22 VAG**: mock responde `"62 11 30 0C 80"` → `readPid("22","1130")` devuelve 800
  - **readDtcCodes**: mock responde `"43 03 01 04 01"` → devuelve `[{code:"P0301"}, {code:"P0401"}]`
  - **readDtcCodes (NO DATA)**: mock responde `"NO DATA"` → devuelve `[]`
  - **readVin**: mock responde multi-línea con VIN Porsche → `"WP0ZZZ99ZTS390000"`
  - **getFreezeFrame**: mock responde `"42 0C 0C 80"` → devuelve freeze frame con valores
  - **getVehicleInfo**: lee VIN → devuelve `{ make: "Porsche", model: "unknown", year: 2019, ... }`
  - **getSupportedPids**: mock responde `"41 00 B8 3B A8 13"` → bitmask parse
  - **Timeout (3s)**: mock nunca emite data → lanza error de conexión
  - **Connection refused**: mock emite ECONNREFUSED → lanza Elm327ConnectionError
  - **Respuesta malformada**: mock responde basura → lanza Elm327ParseError
  - **PID no soportado**: mock responde `"NO DATA"` → lanza Elm327NoDataError
- [x] 2.2 Verificar que tests fallan en RED (mock no implementado aún)

## 3. GREEN — Implementar Elm327TcpRepository

- [x] 3.1 Crear `src/infrastructure/obd/elm327TcpRepository.ts`:
  - `sendCommand(cmd)`: `createConnection` → write `cmd\r\n` → collect data (3s timeout) → destroy → strip echo/prompt/empty lines
  - `parseModeResponse(raw)`: extrae bytes tras `4X YY` → `number[]`
  - `parseMode22Response(raw, didLen)`: extrae bytes tras `62 XX XX` → `number[]`
  - `parseVinResponse(raw)`: líneas con `N:` → extrae bytes ASCII tras `49 02 01`
  - `parseDtcResponse(raw)`: extrae pares de 2 bytes tras `43`
  - `decodeDtc(byte1, byte2)`: SAE J2012 → string "P0301"
  - `pidFormulas`: Map construido desde `STANDARD_MODE_01_PIDS` + VAG Mode 22 DIDs
  - `applyPidFormula(mode, pid, bytes)`: look up formula → `evaluatePid` o fallback big-endian int
  - `readPid(mode, pid)`: send → parse → applyFormula
  - `readDtcCodes()`: send "03" → si NO DATA → `[]`, sino parse + decode
  - `readVin()`: send "09 02" → parseVinResponse → `String.fromCharCode(...bytes)`
  - `getFreezeFrame(dtc?)`: send "02 XX" → parse → `FreezeFrame | null`
  - `getVehicleInfo()`: readVin → `Vin.create(vin)` → `VehicleInfo { make: vin.manufacturer ?? "unknown", model: "unknown", year: vin.modelYear ?? 0, engineType: "unknown", vin }`
  - `getSupportedPids()`: send "01 00" → parse bitmask → string[]
  - `clearDtcCodes()`: send "04" → void (fire-and-forget)
  - `setPower(on)`: no-op
- [x] 3.2 Ejecutar tests unitarios → todos GREEN

## 4. REFACTOR — Inyección en server + routes + main

- [x] 4.1 Modificar `src/infrastructure/http/server.ts`:
  - Añadir `obdRepo?: ObdRepositoryPort` a `ServerDependencies`
  - Pasar `obdRepo` a `createDiagnosisRoutes({ scenarios, obdRepo })`
- [x] 4.2 Modificar `src/infrastructure/http/routes/diagnosis.routes.ts`:
  - Añadir `obdRepo?: ObdRepositoryPort` a `DiagnosisRoutesDeps`
  - `POST /diagnosis`: si `obdRepo` existe, usar `processVehicleDiagnosis(obdRepo)`; si no, flujo actual con escenario
  - `POST /mcp/tools/:toolName`: ídem con `createMcpServer(obdRepo)`
  - `GET /scenarios`: si `obdRepo`, devolver `[{ id: "tcp", name: "ELM327 Direct Connection", vehicleType: "car", ... }]`
- [x] 4.3 Modificar `src/main.ts`:
  - Importar `Elm327TcpRepository`
  - Cuando `OBD_MODE === 'tcp'`: `new Elm327TcpRepository({ host, port })` + `createServer({ obdRepo, ...auth, scenarios: [] })`
  - Cuando `OBD_MODE === 'sync'`: flujo actual sin cambios
- [x] 4.4 Actualizar tests existentes:
  - `diagnosis.routes.test.ts`: añadir test POST /diagnosis con obdRepo mockeado (sin scenario)
  - `diagnosis.routes.test.ts`: añadir test GET /scenarios en modo TCP devuelve entry TCP
  - `server.test.ts`: añadir test modo TCP inyecta repo correctamente

## 5. Añadir Mode 03 + Mode 02 al escenario Python

- [x] 5.1 Modificar `docker/elm327/scenarios/audi_a3_tdi.py`:
  - Añadir entrada Mode 03: DTCs P0301 (Cylinder 1 Misfire), P0401 (EGR Insufficient Flow), P2002 (DPF Efficiency)
  - Añadir entrada Mode 02 (freeze frame): para P0301 con valores de sensores congelados
- [x] 5.2 Reconstruir y verificar:
  ```bash
  docker compose build elm327 && docker compose up -d elm327
  printf '03\r\n' | nc -w 2 localhost 35000
  printf '02 0C\r\n' | nc -w 2 localhost 35000
  ```

## 6. Verificación final

- [x] 6.1 `pnpm test` → todos los tests pasan
- [x] 6.2 `pnpm lint && pnpm format` → sin errores
- [x] 6.3 `pnpm build` → compila sin errores
- [x] 6.4 Test manual end-to-end con `curl` (login + diagnosis en modo TCP)
- [x] 6.5 Actualizar `AGENTS.md` con nuevo estado de sesión
