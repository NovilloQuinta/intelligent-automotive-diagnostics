## 0. Preparación

- [ ] 0.1 Crear rama `feat/refactor-elm327-persistent-session` desde `main`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm test && pnpm build` verdes en `main`
- [ ] 0.3 Cargar skills: `openspec-apply-change`, `tdd-workflow` (para el writer)

## 1. `tcpTransport.ts` — Cliente TCP persistente (TDD)

- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/elm327/tcpTransport.ts` (modificar)
- **Dependencias**: Task 0

### 1.1 RED: Re-escribir tests para el modelo persistente
- [ ] 1.1.1 Re-escribir `apps/core-api/tests/unit/infrastructure/elm327/tcpTransport.test.ts`:
  - Mock de `node:net` adaptado: un solo `createConnection` (no N), socket con `setTimeout`, `setKeepAlive`, eventos `data`/`error`/`close`
  - Test: `connect()` exitoso — `createConnection` llamado 1 vez con host:port correctos
  - Test: `construct()` NO llama a `createConnection` — solo `connect()` lo hace
  - Test: `sendCommand` escribe al socket compartido y resuelve al recibir `>`
  - Test: No resuelve antes del prompt `>` (datos parciales → promesa pendiente)
  - Test: Timeout de comando → rechaza `Elm327ConnectionError`, destruye socket
  - Test: Serialización de comandos — el segundo `sendCommand` no escribe hasta que el primero resuelve
  - Test: Auto-reconexión tras `close` del socket — `connect()` se re-intenta con backoff, comandos pendientes se ejecutan tras reconexión
  - Test: Auto-reconexión tras `error` del socket — mismo comportamiento
  - Test: Backoff exponencial — verificar delays: 100ms, 200ms, 400ms, 800ms (usar `vi.useFakeTimers`)
  - Test: `close()` graceful — destruye socket, rechaza comandos pendientes con "Connection closed", no activa reconexión
  - Test: (ELIMINAR tests de circuit breaker — ya no existen)
  - Verificar que la suite falla (RED — el código antiguo aún existe)

### 1.2 GREEN: Implementar cliente persistente
- [ ] 1.2.1 Reescribir `createElm327TcpClient` en `tcpTransport.ts`:
  - Estado interno: `socket: Socket | null`, `reconnectState`, `reconnectAttempt`, `reconnectTimer`, `commandQueue: CommandEntry[]`, `isProcessing`
  - `connect()`: `createConnection(host, port)` → configura `setTimeout`/`setKeepAlive`, bindea handlers `data`/`error`/`close`
  - `sendCommand(cmd)`: push a cola → `processQueue()` (serializado vía `isProcessing`)
  - `processQueue()`: while cola no vacía → `sendCommandOnce(cmd)` → escribe al socket, timeout, espera `>`, resuelve
  - `reconnect()`: backoff exponencial (cap 30s) → `createConnection` → éxito → `processQueue()`; fallo → reintentar
  - `close()`: marcar `reconnectState = 'closed'`, destruir socket, limpiar timers, rechazar cola con error
  - **ELIMINAR**: circuit breaker completo (`CircuitState`, `failureCount`, `openedAt`, constantes `CIRCUIT_*`, funciones `openCircuit`/`tryHalfOpen`/`onSuccess`/`onFailure`)
  - **ELIMINAR**: lógica de retry en `sendCommand` (la auto-reconexión la reemplaza)
  - **MANTENER**: `Elm327TcpConfig` interface sin cambios, `DEFAULT_TIMEOUT_MS`, imports de `Elm327ConnectionError`
  - **MANTENER**: compatibilidad con `sendCommand(cmd): Promise<string>` (misma firma pública)

### 1.3 REFACTOR
- [ ] 1.3.1 Verificar que los tests de `tcpTransport.test.ts` pasan en verde
- [ ] 1.3.2 `pnpm lint` limpio
- [ ] 1.3.3 Revisar TSDoc — documentar el nuevo comportamiento persistente en el JSDoc de `createElm327TcpClient`

## 2. `elm327Adapter.ts` — Conexión eager + close()

- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (modificar)
- **Dependencias**: Task 1

### 2.1 RED: Actualizar tests del adapter
- [ ] 2.1.1 Actualizar `apps/core-api/tests/unit/infrastructure/elm327/elm327Adapter.test.ts`:
  - El mock de `node:net` debe reflejar el modelo persistente (1 socket, no N)
  - El constructor del adapter ahora llama a `client.connect()` → verificar que `createConnection` se llama 1 vez al construir
  - Los tests de comportamiento (readPid, getSupportedPids, etc.) deben seguir pasando — el adapter orquesta igual, solo cambia el transporte
  - Añadir test: `close()` en el adapter → el socket se destruye, comandos pendientes rechazados
  - Verificar que los tests fallan (RED — el adapter aún no tiene `connect()` eager ni `close()`)

### 2.2 GREEN: Añadir connect() eager + close()
- [ ] 2.2.1 Modificar `Elm327TcpRepository` en `elm327Adapter.ts`:
  - Constructor: tras `this.client = createElm327TcpClient(config)`, añadir `await this.client.connect()` (o `this.client.connect().catch(...)` si no queremos hacer el constructor async)
  - **Decisión de diseño**: El constructor NO puede ser async en TypeScript. Usar `.connect().catch(err => { /* log pero no tirar — la auto-reconexión se encarga */ })` para iniciar la conexión sin bloquear el constructor
  - Añadir método `close(): Promise<void>` que delega en `this.client.close()`
  - Exportar `close` como parte de la API pública
  - Verificar que `ObdRepository` port no cambia (no añade `close` — es responsabilidad del adapter)

### 2.3 REFACTOR
- [ ] 2.3.1 Verificar que los tests del adapter pasan en verde
- [ ] 2.3.2 `pnpm lint` limpio
- [ ] 2.3.3 Actualizar TSDoc del adapter para documentar `connect()` eager y `close()`

## 3. `ProcessVehicleDiagnosisUseCase.ts` — Secuencial

- **Capa**: application
- **Archivos**: `apps/core-api/src/application/use-cases/ProcessVehicleDiagnosisUseCase.ts` (modificar)
- **Dependencias**: Task 2

### 3.1 RED: Actualizar tests del use case
- [ ] 3.1.1 Actualizar `apps/core-api/tests/unit/usecases/ProcessVehicleDiagnosisUseCase.test.ts`:
  - Verificar que las 6 lecturas se ejecutan en orden secuencial (no en paralelo)
  - Mock de `ObdRepository` con `vi.fn()` — verificar orden de llamadas: `readPid('01','0C')` → `readPid('01','05')` → `readPid('01','0D')` → `readPid('01','0F')` → `readDtcCodes()` → `getFreezeFrame()`
  - Verificar que el resultado `DiagnosisResult` es correcto con los valores mock
  - Verificar que los tests fallan (RED — el código aún usa `Promise.all`)

### 3.2 GREEN: Cambiar a secuencial
- [ ] 3.2.1 Reescribir `execute()` en `ProcessVehicleDiagnosisUseCase`:
  - Sustituir `Promise.all([...6 promesas...])` por 6 `await` secuenciales
  - Eliminar `withTimeout` wrapper (el timeout por comando lo gestiona `tcpTransport`)
  - Mantener `DIAGNOSIS_TIMEOUT_MS` como constante exportada (documentación del timeout total esperado)
  - Eliminar la función `withTimeout` del archivo (ya no se usa en este use case — verificar si se usa en otros lugares primero con grep)

### 3.3 REFACTOR
- [ ] 3.3.1 Verificar que los tests del use case pasan en verde
- [ ] 3.3.2 `pnpm lint` limpio
- [ ] 3.3.3 Si `withTimeout` no se usa en ningún otro módulo, eliminarla. Si se usa, dejarla.

## 4. Verificación final (Zero Broken Windows)

- **Capa**: todas
- **Archivos**: ninguno nuevo
- **Dependencias**: Tasks 1, 2, 3

- [ ] 4.1 `pnpm test` → todos los tests pasan (tcpTransport, elm327Adapter, ProcessVehicleDiagnosisUseCase + suite completa)
- [ ] 4.2 `pnpm lint && pnpm format` → sin errores
- [ ] 4.3 `pnpm build` → compila sin errores
- [ ] 4.4 Verificación manual opcional: `printf '01 0C\r\n' | nc -w 2 localhost 35000` (emulador Docker) si está corriendo
- [ ] 4.5 Actualizar `AGENTS.md` (SESION ACTUAL: cambio `refactor-elm327-persistent-session` completado)
