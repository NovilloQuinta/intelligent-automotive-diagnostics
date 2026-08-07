## 0. Preparación

- [ ] 0.1 Crear rama `refactor/elm327-adapter-srp` desde `main` (el árbol de trabajo tiene cambios sin commitear de sesiones previas — no incluirlos en esta rama si no corresponden al refactor)
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm test && pnpm build` verdes en `main`

## 1. Extraer `errors.ts` (TDD)

- [ ] 1.1 RED: crear `tests/unit/infrastructure/elm327/errors.test.ts`:
  - `new Elm327ConnectionError('msg')` → `name === 'Elm327ConnectionError'`, `message === 'msg'`
  - `new Elm327NoDataError('01 0C\rNO DATA')` → `name === 'Elm327NoDataError'`, mensaje incluye el raw
  - `new Elm327ParseError('CAN ERROR')` → `name === 'Elm327ParseError'`, mensaje incluye el raw
  - Verificar que falla (los errores aún viven en el adapter; el import a `./errors.js` no existe)
- [ ] 1.2 GREEN: crear `src/infrastructure/elm327/errors.ts` moviendo las 3 clases verbatim (TSDoc incluido)
- [ ] 1.3 REFACTOR: en `elm327Adapter.ts` sustituir las definiciones por re-export `export { Elm327ConnectionError, Elm327NoDataError, Elm327ParseError } from './errors.js'`
- [ ] 1.4 Suite completa verde (`pnpm test`) — los 16 tests del adapter no cambian ni una línea

## 2. Extraer `hexUtils.ts` (TDD)

- [x] 2.1 RED: crear `tests/unit/infrastructure/elm327/hexUtils.test.ts`:
  - `parseHexBytes('0C 80')` → `[0x0C, 0x80]`; `'0C   80 '` (espacios extra) → igual; `''` → `[]`
  - `bigEndian([0x0C, 0x80])` → 3200; `[0x01, 0x00]` → 256; `[]` → 0
  - Verificar que falla (módulo no existe)
- [x] 2.2 GREEN: crear `src/infrastructure/elm327/hexUtils.ts` con `parseHexBytes()` y `bigEndian()` verbatim
- [x] 2.3 REFACTOR: `elm327Adapter.ts` importa de `./hexUtils.js`, elimina las funciones locales
- [x] 2.4 Suite completa verde + `pnpm lint`

## 3. Extraer `protocol.ts` (TDD)

- [ ] 3.1 RED: crear `tests/unit/infrastructure/elm327/protocol.test.ts` (importa desde `./protocol.js`):
  - `formatCommand('22', '1130')` → `'22 11 30'`; `formatCommand('01', '0c')` → `'01 0C'`; `formatCommand('01', '0 C')` → `'01 0C'` (spaces limpiados)
  - `stripEcho('01 0C\r41 0C 0C 80 \r\r>')` → `'41 0C 0C 80'`; elimina líneas `AT*`, `OK`, `>`, vacías
  - `parseModeResponse`: RPM `'41 0C 0C 80'` → `[0x0C, 0x80]`; coolant `'41 05 82'` → `[0x82]`; `NO DATA` → lanza `Elm327NoDataError`; `'CAN ERROR'` → lanza `Elm327ParseError`
  - `parseMode22Response`: `'62 11 30 0C 80'` → `[0x0C, 0x80]`; `'62 F4 30 5A'` → `[0x5A]`; con `didLen=2` corta a 2 bytes; `NO DATA` → `Elm327NoDataError`
  - `parseVinResponse`: multi-línea Porsche (misma fixture que el adapter test) → 17 bytes ASCII; quita prefijo `49 02 01`
  - `parseDtcResponse`: `'43 03 01 04 01'` → `[[0x03,0x01],[0x04,0x01]]`; `NO DATA` → `[]`
  - `parseSupportedPidBitmask([0xB8, 0x3B, 0xA8, 0x13])` → lista `['01 01','01 03',...]` idéntica a la del test existente de `getSupportedPids`
- [ ] 3.2 GREEN: crear `src/infrastructure/elm327/protocol.ts` moviendo verbatim `stripEcho` (→ función pura exportada), `parseModeResponse`, `parseMode22Response`, `parseVinResponse`, `parseDtcResponse`, `formatCommand`, y extrayendo `parseSupportedPidBitmask(bytes)` del cuerpo de `getSupportedPids`
- [ ] 3.3 REFACTOR: `elm327Adapter.ts` elimina los métodos privados y usa `protocol.ts`; `getSupportedPids()` pasa a `sendCommand('01 00')` → `parseModeResponse` → `parseSupportedPidBitmask`
- [ ] 3.4 Suite completa verde (los 16 tests del adapter, incluido `getSupportedPids` con su lista exacta) + `pnpm lint`

## 4. Extraer `pidFormulas.ts` (TDD)

- [ ] 4.1 RED: crear `tests/unit/infrastructure/elm327/pidFormulas.test.ts` (importa desde `./pidFormulas.js`):
  - `createPidFormulaCatalog().get('01','0C')` → `{ formula: '(A*256+B)/4', dataBytes: 2 }`
  - `apply('01','0C',[0x0C,0x80])` → 800; `apply('01','05',[0x82])` → 90; `apply('22','1130',[0x0C,0x80])` → 800; `apply('22','F430',[0x5A])` → 90
  - PID desconocido: `apply('01','XX',[0x0C,0x80])` → 3200 (fallback big-endian)
  - Fórmula vacía (caso `'01 00'` no existe en el catálogo — usar un registro con `formula: ''` si se añade, o verificar que `get('09','02')` → `undefined` y `apply` → bigEndian)
  - **Paridad**: iterar `STANDARD_MODE_01_PIDS` (import de `@/infrastructure/persistence/sqlite/seed-pids.js`) y verificar que `get(pidCode.mode, pidCode.pid)` coincide en `formula` + `dataBytes` para las 16 entradas
- [ ] 4.2 GREEN: crear `src/infrastructure/elm327/pidFormulas.ts`:
  - `PidFormula` interface + `STANDARD_MODE_01_FORMULAS` (16 claves `"01 XX"` con las fórmulas de `seed-pids.ts` como datos planos) + `VAG_MODE_22_FORMULAS` movida verbatim del adapter (claves `"22 XXXX"`)
  - `createPidFormulaCatalog()`: `get(mode,pid)` con clave `` `${mode} ${pid.toUpperCase()}` ``; `apply` con fallback `bigEndian` y `evaluatePid` (import de `./pidParser.js`)
- [ ] 4.3 REFACTOR: `elm327Adapter.ts` elimina `VAG_MODE_22_FORMULAS`, el `Map` y `applyPidFormula()`; constructor usa `createPidFormulaCatalog()`; **eliminar el import de `seed-pids.js`** de `elm327Adapter.ts` (grep de verificación: ningún `seed-pids` en `src/infrastructure/elm327/`)
- [ ] 4.4 Suite completa verde + `pnpm lint`

## 5. Extraer `tcpTransport.ts` (TDD)

- [ ] 5.1 RED: crear `tests/unit/infrastructure/elm327/tcpTransport.test.ts` con su propio `vi.mock('node:net')` (mismo harness que el adapter test: socket con `on`/`write`/`destroy`/`emit`):
  - `sendCommand('01 0C')` escribe `'01 0C\r\n'` y resuelve `'01 0C\r41 0C 0C 80 \r\r>'` al emitir data con `>`
  - No resuelve antes del `>` (emitir data sin `>` y verificar que la promesa sigue pendiente)
  - Timeout (config `timeout: 10`) → rechaza `Elm327ConnectionError`
  - Socket `error` ECONNREFUSED → rechaza `Elm327ConnectionError`
  - Destruye el socket y limpia el timer en ambos casos
- [ ] 5.2 GREEN: crear `src/infrastructure/elm327/tcpTransport.ts` con `Elm327TcpConfig`, `DEFAULT_TIMEOUT_MS = 3000` y `createElm327TcpClient(config)` implementando `sendCommand` verbatim (lógica actual del método privado)
- [ ] 5.3 REFACTOR: `elm327Adapter.ts` elimina `sendCommand()`, `DEFAULT_TIMEOUT_MS` y `Elm327TcpConfig`; constructor crea `this.client = createElm327TcpClient(config)`; re-export `export type { Elm327TcpConfig } from './tcpTransport.js'`
- [ ] 5.4 Suite completa verde (los 16 tests del adapter — timeout y ECONNREFUSED incluidos) + `pnpm lint`

## 6. Composición final del adapter (REFACTOR)

- [ ] 6.1 `elm327Adapter.ts` debe quedar como composition root puro:
  - Imports: `node:net` ELIMINADO; `seed-pids` ELIMINADO; solo `ObdRepository`, value objects de dominio, y `./errors.js`, `./hexUtils.js` (si aún se usa), `./pidFormulas.js`, `./pidParser.js`? (no — evaluatePid solo en pidFormulas), `./protocol.js`, `./tcpTransport.js`, `./vinDecoder.js`
  - Clase ~120 líneas: constructor (client + catalog) + 8 métodos públicos orquestando
  - Re-exports finales: errores + `Elm327TcpConfig`
  - `UNKNOWN_FREEZE_FRAME_DTC` permanece en el adapter
- [ ] 6.2 Verificación estructural: `grep -rn "seed-pids" src/infrastructure/elm327/` → vacío; `wc -l elm327Adapter.ts` → ~120
- [ ] 6.3 Suite completa verde + `pnpm lint`

## 7. Verificación final (Zero Broken Windows)

- [ ] 7.1 `pnpm test` → 404+ tests verdes (16 del adapter intactos + ~5 ficheros nuevos)
- [ ] 7.2 `pnpm lint && pnpm format` → sin errores
- [ ] 7.3 `pnpm build` → compila sin errores
- [ ] 7.4 Verificación manual opcional: `printf '01 0C\r\n' | nc -w 2 localhost 35000` (emulador Docker) si está corriendo
- [ ] 7.5 Actualizar `AGENTS.md` (SESION ACTUAL: cambio `refactor-elm327-adapter-srp` completado, tests totales) — coordinado con `@orchestrator`
