## Contexto

Dos problemas que comparten solución: falta el transporte serial para USB, y la UI no muestra el tipo de conexión. La abstracción de transporte ya existe de hecho en `tcpTransport.ts` (`Elm327TcpClient` con `connect`/`sendCommand`/`close`); solo hay que darle nombre de interfaz, extraerla y hacer una segunda implementación para serial.

## Decision 1: extraer `Elm327Transport` como interfaz, no como clase abstracta

La interfaz expone tres métodos:

```ts
interface Elm327Transport {
  connect(): Promise<void>
  sendCommand(cmd: string): Promise<string>
  close(): Promise<void>
}
```

`Elm327TcpClient` ya los tiene. `SerialTransport` los implementa igual. El adapter (`Elm327TcpRepository`) recibe un `Elm327Transport` en vez de crear él mismo el cliente TCP.

**Por qué interfaz y no clase abstracta.** No hay lógica compartida entre TCP y serial más allá de la firma. La cola FIFO y la reconexión son específicas de cada transporte (una gestiona sockets `net`, la otra puertos `serialport`). Forzar una clase base introduciría acoplamiento sin beneficio. Si más adelante aparece lógica común (ej. un buffer de eco compartido), se extrae a una función — no a una jerarquía.

**Renaming.** `Elm327TcpRepository` debería llamarse `Elm327Adapter` — pero eso es un refactor cosmético que rompe imports por todo el proyecto. Se deja el nombre actual y se cambia solo la firma del constructor para aceptar `Elm327Transport`. Si el reviewer insiste en el rename, se hace en tarea aparte.

## Decision 2: SerialTransport reimplementa cola FIFO, no reutiliza la de TCP

Cada transporte tiene su propio bucle de escritura/lectura ligado a su stream subyacente. Intentar compartir la cola entre TCP y serial crea un acoplamiento frágil: el serial necesita gestionar `SerialPort` (open/close/drain/parity), el TCP necesita `Socket` (connect/destroy/setTimeout). Son streams distintos.

La implementación de `SerialTransport` sigue el mismo patrón que `TcpTransport` (cola `CommandEntry[]`, mutex `isProcessing`, prompt `>` como delimitador, timeout por comando, reconexión con backoff), pero con su propio stream. El código será similar — y eso está bien. Dos implementaciones similares de un contrato común son mejor que una abstracción forzada con 15 ramas `if (serial) ... else`.

## Decision 3: `connectionType` es parte del `ScenarioDescriptor`, no un endpoint separado

El tipo de conexión es una propiedad del escenario, igual que el `vehicleType`. No tiene sentido un endpoint `/api/connection-type` cuando ya se devuelve la lista de escenarios con `GET /api/scenarios`.

Valores: `'wifi'` (TCP/IP), `'usb'` (serial), `'bluetooth'` (RFCOMM — futuro).

El `TCP_DIRECT_SCENARIO` sintético (modo `tcp`) lleva `connectionType: 'wifi'`. Los escenarios docker también `'wifi'`. El nuevo modo serial devuelve un escenario con `connectionType: 'usb'`.

## Decision 4: el icono de conexión va en el ConnectionStatus y en el wizard

Dos ubicaciones, una fuente de verdad:

1. **TopBar `ConnectionStatus`**: el LED verde/rojo de "Conectado"/"Sin conexión" se complementa con un icono de WiFi/USB/Bluetooth a su izquierda. La información viene del escenario seleccionado (`scenario.connectionType`).

2. **Wizard `ConnectionButton`**: cada tarjeta de escenario muestra el icono de conexión debajo del nombre del vehículo, en una línea pequeña: "WiFi · 192.168.1.100:35000" o "USB · /dev/ttyUSB0". Para el modo docker no se muestra IP — solo el tipo.

**No se añade un selector de tipo de conexión en la UI.** La conexión se configura en el backend (variables de entorno). La UI solo la muestra. Un selector implicaría que el usuario puede cambiar de WiFi a USB en caliente, y eso requiere reiniciar el transporte — complejidad que no aporta valor ahora.

## Decision 5: `node-serialport` se añade como dependencia de `apps/core-api`

Paquete: `serialport` (npm). Se usa la API moderna basada en promesas (`SerialPort` con `open()` async, eventos `data`/`error`/`close`).

Baud rate por defecto: `38400`. Es el estándar de fábrica del ELM327. Algunos clones chinos vienen a `9600` o `115200`; el usuario lo configura con `SERIAL_BAUD_RATE`.

**No se hace auto-detección del puerto.** Escanear `/dev/ttyUSB*` o `/dev/ttyAMA*` y probar cada uno con `AT\r\n` es frágil y lento. El usuario indica el path con `SERIAL_PORT_PATH`. Si hay un segundo cambio más adelante, se añade el escaneo como comando `AT` de prueba.

## Decision 6: los emuladores docker no cambian

Los escenarios docker (`toyota`, `audi-a3-tdi`, `kawasaki-z900`) siguen siendo `connectionType: 'wifi'` porque hablan TCP al emulador. No se añade un emulador serial: el propósito del emulador es desarrollo, y el transporte serial se prueba contra un dispositivo real o un mock.

## Riesgos

- **`serialport` requiere permisos de hardware en Linux.** El usuario que ejecute `core-api` necesita pertenecer al grupo `dialout` o ejecutar con `sudo`. Esto es un requisito del sistema operativo, no del código. Se documenta en el README.
- **La desconexión física del USB no siempre emite evento `close` en Linux.** Algunos kernels no notifican hasta la siguiente escritura. El timeout de comando (3s) sirve de red de seguridad: si el dispositivo desaparece, el siguiente comando falla por timeout y dispara la reconexión.
- **`connectionType: 'bluetooth'` queda sin implementar.** La UI lo muestra si el backend lo envía, pero no hay transporte Bluetooth. Si alguien configura `OBD_MODE=bluetooth` sin que exista el adaptador, el sistema arranca pero falla al conectar. Se acepta el riesgo: el enum está completo desde el día 1 para no romper la API después.
