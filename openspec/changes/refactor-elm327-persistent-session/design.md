## Context

Rama `feat/refactor-elm327-persistent-session`. Fase 4 (Diagnóstico Cognitivo LLM). Stack: TypeScript ESM strict, Node.js `net` module, Clean Architecture, Vitest. Suite actual: 469 tests verdes (39 ficheros).

Estado actual de `tcpTransport.ts`: factory function `createElm327TcpClient(config)` que devuelve `{ sendCommand(cmd) }`. Cada `sendCommand` abre un nuevo socket con `createConnection`, envía el comando, espera el prompt `>` y cierra. Incluye retry con backoff exponencial (3 intentos, 200ms base) y circuit breaker (5 fallos consecutivos → 30s de rechazo).

Consumidores del método `sendCommand()`:
1. `Elm327TcpRepository` en `elm327Adapter.ts` — constructor crea `this.client = createElm327TcpClient(config)`. Los 8 métodos del puerto llaman `this.client.sendCommand(...)`.
2. `ProcessVehicleDiagnosisUseCase` — llama `this.repo.readPid()` × 4 + `readDtcCodes()` + `getFreezeFrame()` en `Promise.all`.
3. MCP tool calls — usan `ObdRepository` (mismo adapter), sin cambios necesarios.

Verificación previa: `sendCommand()` es el único punto de entrada al socket. No hay otros consumidores del módulo `tcpTransport.ts`. Los tests existentes (tcpTransport.test.ts y elm327Adapter.test.ts) mockean `node:net` con `vi.mock` file-scoped.

## Goals / Non-Goals

**Goals:**
- Abrir **un solo socket TCP** al instanciar el cliente y reutilizarlo para todos los comandos
- Serializar comandos con una **cola FIFO + mutex** para evitar escrituras concurrentes en el socket
- Auto-reconexión con backoff exponencial: si el socket se rompe, reconecta automáticamente sin rechazar tráfico
- `close()` para shutdown graceful (destruir socket, limpiar timers, rechazar comandos pendientes con error claro)
- Mantener compatibilidad con `Node.js` streams (incluido `setTimeout`/`setKeepAlive`)
- Preservar el timeout por comando (`config.timeout ?? 3000ms`)
- Preservar compatibilidad con los 8 métodos del adapter (sin cambios en firma ni valores de retorno)

**Non-Goals:**
- No cambia el comportamiento del protocolo ni los comandos enviados al emulador
- No introduce un pool de sockets (un solo socket es suficiente para el caso de uso)
- No implementa health checks periódicos (el socket se monitorea reactivamente vía eventos `error`/`close`)
- No toca `ObdRepository` port, `composition.ts`, `DiagnosisController`, MCP tools, ni el resto de módulos de `elm327/`
- No introduce una dependencia externa de colas/mutex (se implementa con promesas nativas)

## Decisions

### 1. Socket persistente con cola FIFO + mutex — sin librerías externas

**Elegido**: `createElm327TcpClient` mantiene un socket vivo en `let socket: Socket | null`. Inicialmente `undefined` hasta que se llama a `connect()` (eager, desde el constructor del adapter). `sendCommand(cmd)` implementa:

```typescript
// Cola de comandos pendientes (cada entrada es { cmd, resolve, reject })
const commandQueue: Array<{
  cmd: string
  resolve: (value: string) => void
  reject: (reason: Error) => void
}> = []

let isProcessing = false

async function sendCommand(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    commandQueue.push({ cmd, resolve, reject })
    processQueue()
  })
}

async function processQueue(): Promise<void> {
  if (isProcessing) return
  isProcessing = true
  while (commandQueue.length > 0) {
    const entry = commandQueue[0]
    try {
      const result = await sendCommandOnce(entry.cmd) // escribe al socket y espera '>'
      entry.resolve(result)
      commandQueue.shift()
    } catch (err) {
      // Si es error de conexión, inicia reconexión y mantiene el comando en cola
      if (isConnectionError(err) && reconnectState !== 'closed') {
        await reconnect()
        // Reintenta el mismo comando — no hace shift
      } else {
        entry.reject(err as Error)
        commandQueue.shift()
      }
    }
  }
  isProcessing = false
}
```

**Alternativas evaluadas**:
- (a) `async-mutex` o `p-queue`: añade dependencia innecesaria para un caso trivial (1 productor lógico — el adapter — llamando secuencialmente). La cola nativa con promesas es ~30 líneas, sin dep externa, totalmente testeable.
- (b) Sin cola, confiar en que el adapter siempre serializa: acopla el transporte a la disciplina del caller. Si un futuro caller (ej. MCP tool paralelo) llama sin serializar, corrompe el socket. La cola es defensiva por diseño.

### 2. Auto-reconexión con backoff exponencial — sin circuit breaker

**Elegido**: Cuando el socket emite `error` o `close`, el cliente:
1. Marca `reconnectState = 'reconnecting'`
2. Intenta `createConnection` con backoff: 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms (cap), ... hasta 30s máximo (cap en 30s)
3. Al reconectar exitosamente, marca `reconnectState = 'connected'`, drena la cola de comandos pendientes
4. Los comandos que lleguen durante la reconexión se rechazan con `Elm327ConnectionError` indicando "reconnecting" (para que el adapter/MCP sepa que debe reintentar a nivel superior) **o** se encolan y esperan — **decidido: encolar y esperar**, la cola ya gestiona el backpressure

**Se elimina**: el circuit breaker (`CircuitState`, `failureCount`, `openedAt`, `CIRCUIT_BREAKER_THRESHOLD`, `CIRCUIT_RESET_MS`, `openCircuit()`, `tryHalfOpen()`, `onSuccess()`, `onFailure()`). La auto-reconexión es estrictamente superior: en lugar de rechazar tráfico durante 30s, reconecta automáticamente.

**Alternativas evaluadas**:
- (a) Mantener circuit breaker + añadir persistencia: complejidad innecesaria. Dos mecanismos de resiliencia que compiten (circuit breaker abre → auto-reconexión también intenta reconectar → conflicto). Un solo mecanismo es más simple y predecible.
- (b) Sin auto-reconexión, delegar al caller: cada `sendCommand` tendría que detectar `ECONNREFUSED` y reintentar con backoff. El código de reintento se dispersaría por el adapter y los MCP tools. Centralizarlo en el transporte es el lugar correcto (SRP).

### 3. `Elm327TcpConfig` se mantiene sin cambios — semántica de campos ajustada

**Elegido**: La interfaz `Elm327TcpConfig` no cambia:
```typescript
export interface Elm327TcpConfig {
  readonly host: string
  readonly port: number
  readonly timeout?: number      // Timeout por comando en ms (default 3000). Sin cambios.
  readonly maxRetries?: number   // Reintentos ANTE FALLOS DE ENVÍO (no de conexión). Default 3. Semántica ajustada: ahora solo aplica a fallos del comando en sí (timeout del prompt '>'), no a fallos de conexión (que gestiona la auto-reconexión).
  readonly backoffMs?: number    // Backoff base entre reintentos de envío en ms (default 200). Sin cambios.
}
```

**Razón**: La interfaz ya expresa timeout y backoff; la semántica de `maxRetries` se ajusta (antes cubría fallos de conexión también, ahora solo el envío del comando una vez el socket está conectado). Los consumidores (`composition.ts`, tests) no cambian ni una línea de configuración.

### 4. `ProcessVehicleDiagnosisUseCase` — `Promise.all` → secuencial

**Elegido**: Las 6 lecturas pasan de `Promise.all([...])` a `await` secuencial:

```typescript
const rpm = await this.repo.readPid(MODE_CURRENT_DATA, PID_RPM)
const coolantTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_COOLANT_TEMP)
const speed = await this.repo.readPid(MODE_CURRENT_DATA, PID_SPEED)
const intakeTemp = await this.repo.readPid(MODE_CURRENT_DATA, PID_INTAKE_TEMP)
const dtcCodes = await this.repo.readDtcCodes()
const freezeFrame = await this.repo.getFreezeFrame()
```

**Razón**: Un solo socket TCP serializa los comandos de todas formas (la cola en `tcpTransport` lo garantiza). Ejecutar en paralelo con `Promise.all` solo añade complejidad sin beneficio: los 6 comandos se encolarían y ejecutarían secuencialmente igual. Hacerlo explícito en el use case:
- Documenta la intención (el diagnóstico es inherentemente secuencial sobre una conexión compartida)
- Elimina el `withTimeout` wrapper que envolvía el `Promise.all` — ahora el timeout aplica por comando individual (gestionado por `tcpTransport`)

El `DIAGNOSIS_TIMEOUT_MS` se mantiene como constante exportada (valor 10_000ms) para documentar el timeout total esperado del diagnóstico, pero deja de envolver las promesas con `Promise.race`.

### 5. Mock TCP adaptado al modelo persistente — un solo socket por test

**Elegido**: El mock de `node:net` en los tests se adapta:
- `createConnection` se llama una sola vez (al construir el cliente con `connect()`), no N veces
- El mock socket ahora tiene `setTimeout`, `setKeepAlive`, y emite eventos `data`, `error`, `close`
- Los tests de `tcpTransport` verifican: un solo `createConnection`, comandos serializados (el segundo comando no escribe hasta que el primero resuelve), auto-reconexión tras `close`/`error`, shutdown con `close()`

**Alternativa rechazada**: Refactorizar el mock en un helper compartido. `vi.mock` se hoistea por fichero; la duplicación del mock (~50 líneas) es aceptable para mantener tests deterministas y file-scoped.

### 6. `elm327Adapter.ts` — `connect()` eager en constructor + `close()` para shutdown

**Elegido**: El constructor de `Elm327TcpRepository` ahora:
1. Crea el cliente con `createElm327TcpClient(config)`
2. Llama a `client.connect()` inmediatamente (eager)

Se añade un método `close()` al adapter:
```typescript
async close(): Promise<void> {
  await this.client.close()
}
```

**Razón**: La conexión eager es necesaria porque el ciclo de vida del adapter es "nace cuando arranca la app, muere cuando la app se detiene". `close()` permite graceful shutdown (el `composition.ts` o `server.ts` pueden llamarlo en `SIGTERM`/`SIGINT`).

**Riesgo mitigado**: Si el emulador no está disponible al arrancar, `connect()` falla pero la auto-reconexión se activa inmediatamente — la primera petición de diagnóstico esperará a que la reconexión tenga éxito (o timeout). El adapter nunca se construye en estado "roto permanente".

## Data Model

### Estado interno del cliente persistente

```
createElm327TcpClient(config)
├── socket: Socket | null          ← el socket vivo (null si no conectado)
├── reconnectState: 'connected' | 'reconnecting' | 'closed'
├── reconnectAttempt: number       ← contador para backoff exponencial
├── reconnectTimer: NodeJS.Timer?   ← timer para el próximo intento de reconexión
├── commandQueue: CommandEntry[]    ← cola FIFO de comandos pendientes
│   └── { cmd: string, resolve, reject, timeoutTimer }
├── isProcessing: boolean          ← mutex para serializar processQueue()
├── connect(): Promise<void>       ← abre el socket y configura handlers
├── sendCommand(cmd): Promise<string> ← encola y serializa
├── sendCommandOnce(cmd): Promise<string> ← escribe al socket y espera '>'
├── processQueue(): Promise<void>  ← drena la cola secuencialmente
├── reconnect(): Promise<void>     ← backoff exponencial + reconexión
└── close(): Promise<void>         ← destruye socket, vacía cola con error, limpia timers
```

### Flujo de comandos

```
sendCommand("01 0C")
  → push a commandQueue
  → processQueue()
    → isProcessing? return : isProcessing = true
    → while queue not empty:
        → sendCommandOnce("01 0C")
          → socket.write("01 0C\r\n")
          → set timeout (config.timeout)
          → esperar data hasta '>'
          → resolver con respuesta cruda
        → commandQueue.shift()
        → (on error de conexión) → reconnect() → reintentar mismo comando
    → isProcessing = false
```

### Flujo de reconexión

```
socket.on('error') o socket.on('close')
  → si reconnectState === 'closed' → no hacer nada
  → reconnectState = 'reconnecting'
  → calcular backoff: min(backoffMs * 2^attempt, 30_000)
  → setTimeout → createConnection(host, port)
    → éxito: socket = newSocket, configurar handlers, reconnectState = 'connected'
             → processQueue() (drenar comandos pendientes)
    → fallo: incrementar attempt, reintentar con backoff
```

## Error Handling

| Error | Origen | Comportamiento |
|---|---|---|
| `Elm327ConnectionError` | `tcpTransport.ts` — timeout de comando (>3000ms sin `>`) | Se rechaza el comando actual. La cola avanza al siguiente. |
| `Elm327ConnectionError` | `tcpTransport.ts` — socket `error` (ECONNREFUSED, etc.) | Se inicia auto-reconexión. El comando actual se mantiene en cola y se reintenta tras reconexión exitosa. |
| `Elm327ConnectionError` | `tcpTransport.ts` — `close()` llamado | Todos los comandos pendientes en cola se rechazan con "Connection closed". No se reintenta. |
| `Elm327ConnectionError` | `tcpTransport.ts` — timeout total de auto-reconexión (30s cap) | Si tras 30s de backoff no se reconecta, se rechazan los comandos pendientes con "Reconnection failed after 30s". La cola se vacía. |

**Nota**: `Elm327NoDataError` y `Elm327ParseError` (de `protocol.ts`) no cambian — solo los lanza el adapter tras parsear la respuesta del socket.

## Risks / Trade-offs

- [Un solo socket = punto único de fallo] → Mitigado por la auto-reconexión. Si el socket se rompe, se reconecta automáticamente. El adapter nunca se queda sin socket más allá del tiempo de backoff.
- [Comandos secuenciales = más latencia total] → Trade-off aceptado. La latencia adicional de serializar 6 comandos (~18ms a 115200 baud) es insignificante comparada con la fiabilidad de una conexión compartida. El emulador Docker responde en <1ms por comando.
- [Mock de un solo socket en tests — posible falso positivo] → Mitigado por tests específicos: verificar que `createConnection` se llama exactamente 1 vez (no N), verificar serialización (segundo comando no escribe hasta que el primero termina), verificar reconexión tras `close`.
- [Eliminación del circuit breaker — pérdida de protección contra fallos en cascada] → La auto-reconexión con backoff exponencial es una protección equivalente: en lugar de rechazar tráfico, lo retiene en cola hasta reconectar. Si el emulador está caído permanentemente, los comandos eventualmente timeout (timeout por comando + cap de reconexión 30s).
