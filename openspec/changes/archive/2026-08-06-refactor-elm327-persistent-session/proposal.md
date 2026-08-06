## Why

Cada `sendCommand()` en `tcpTransport.ts` abre un nuevo socket TCP, envía el comando, espera el prompt `>` y cierra. Una sola petición `POST /api/diagnosis` dispara 6 comandos en paralelo (`Promise.all` en `ProcessVehicleDiagnosisUseCase.ts`) → 6 sockets efímeros contra el mismo dispositivo ELM327. Esto es ineficiente y puede saturar el emulador/dispositivo cuando múltiples peticiones concurrentes multiplican la presión (N peticiones × 6 sockets).

Además, el circuit breaker actual (5 fallos consecutivos → rechazo durante 30s) es un mecanismo reactivo que deja al sistema inoperable cuando el dispositivo ELM327 se cae temporalmente. La auto-reconexión con backoff exponencial es más resiliente: reconecta automáticamente sin rechazar tráfico.

## What Changes

### 1. `tcpTransport.ts` — Cliente TCP persistente con auto-reconexión

- `createElm327TcpClient` pasa de efímero (un socket por `sendCommand`) a **persistente** (un socket compartido durante toda la vida del cliente):
  - Abre **un solo socket** al instanciarse (`connect()`) y lo mantiene vivo
  - `sendCommand()` escribe por el socket compartido
  - **Cola interna con mutex** para serializar comandos — un solo socket TCP no admite escrituras concurrentes
  - **Auto-reconexión con backoff exponencial**: si el socket se rompe (`error`/`close`), reconecta automáticamente. Los comandos que lleguen durante la reconexión se encolan y esperan.
  - `close()` para shutdown graceful: destruye el socket, rechaza comandos pendientes con error descriptivo, limpia timers
  - Se **elimina el circuit breaker** (la auto-reconexión lo reemplaza como mecanismo de resiliencia)

### 2. `elm327Adapter.ts` — Conexión eager en el constructor

- El constructor de `Elm327TcpRepository` ahora **conecta de verdad** al arrancar (invoca `client.connect()`), en lugar de solo instanciar el objeto cliente sin abrir socket
- Sin cambios en la interfaz `ObdRepository` — misma firma en los 8 métodos

### 3. `ProcessVehicleDiagnosisUseCase.ts` — Ejecución secuencial

- Las 6 lecturas OBD pasan de `Promise.all([...6 comandos en paralelo...])` a **secuenciales** (`await` uno tras otro)
- Razón: un solo socket TCP compartido requiere serialización de comandos (la cola ya la gestiona `tcpTransport`, pero el use case debe adaptarse al nuevo modelo)

### 4. Tests

- Tests unitarios para el cliente persistente: conexión única, cola de comandos, auto-reconexión, shutdown graceful
- Tests para `Elm327TcpRepository` con socket persistente
- Actualizar tests de `ProcessVehicleDiagnosisUseCase` (verificar secuencialidad)

## Lo que NO cambia

- `ObdRepository` port — misma interfaz, misma firma en los 8 métodos
- MCP tool calls — usan el mismo socket compartido sin cambios en su código
- `Elm327TcpConfig` — misma interfaz de configuración (`host`, `port`, `timeout?`, `maxRetries?`, `backoffMs?`)
- `errors.ts`, `protocol.ts`, `pidFormulas.ts`, `hexUtils.ts` — sin cambios
- `elm327Adapter.ts` re-exports — misma API pública

## Capabilities

### Modified Capabilities
- `elm327-tcp-repository`: El transporte TCP del adaptador ELM327 pasa de sockets efímeros con circuit breaker a conexión persistente con auto-reconexión y cola de comandos serializada. El use case de diagnóstico pasa de lectura paralela a secuencial. Comportamiento externo (commands, parsing, errores, valores físicos) sin cambios.

## Impact

- **Modificado**: `apps/core-api/src/infrastructure/elm327/tcpTransport.ts` (de ~149 líneas efímeras a ~200 líneas persistentes)
- **Modificado**: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (de ~119 a ~125 líneas — añade `connect()` en constructor + `close()` para shutdown)
- **Modificado**: `apps/core-api/src/application/use-cases/ProcessVehicleDiagnosisUseCase.ts` (de ~54 líneas, `Promise.all` → secuencial)
- **Modificado**: `apps/core-api/tests/unit/infrastructure/elm327/tcpTransport.test.ts` (re-escritura completa para modelo persistente)
- **Modificado**: `apps/core-api/tests/unit/infrastructure/elm327/elm327Adapter.test.ts` (adaptar mock TCP al modelo persistente)
- **Modificado**: `apps/core-api/tests/unit/usecases/ProcessVehicleDiagnosisUseCase.test.ts` (verificar secuencialidad)
- **Sin cambios**: `ObdRepository` port, `composition.ts`, `DiagnosisController`, `createMcpServer`, `errors.ts`, `protocol.ts`, `pidFormulas.ts`, `hexUtils.ts`, `vinDecoder.ts`
