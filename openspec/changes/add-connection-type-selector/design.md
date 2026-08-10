## Contexto

`createDiagnosisService` en `composition.ts` tiene 3 ramas por `OBD_MODE`:

| Modo | `scenarios` | `obdRepo` | `obdRepos` | `directScenario` | `listScenarios()` devuelve |
|---|---|---|---|---|---|
| `docker` | 3 emuladores | — | mapa de 3 | — | `this.scenarios` |
| `serial` | `[]` | SerialTransport | — | `SERIAL_DIRECT_SCENARIO` | `[this.directScenario]` |
| `tcp` | `[]` | TcpTransport | — | `TCP_DIRECT_SCENARIO` (default) | `[this.directScenario]` |

`listScenarios()` actual:

```ts
listScenarios(): ScenarioDescriptor[] {
    if (this.obdRepo) return [this.directScenario]
    return this.scenarios
}
```

Dos ramas: "modo directo single" vs "modo docker". No existe el concepto de "modo directo multi-escenario".

El wizard (`VehicleAutoDetectWizard`) ya renderiza un `ConnectionButton` por cada escenario del array que recibe. `resolveRepository()` ya busca por `scenarioId` en `obdRepos` antes del fallback a `obdRepo`.

## Goals / Non-Goals

**Goals:**
- En `OBD_MODE=tcp`, exponer WiFi, USB y Bluetooth como opciones seleccionables en el wizard.
- `OBD_MODE=docker` y `OBD_MODE=serial` sin cambios.
- Sin modificar la UI (el wizard ya maneja N escenarios).
- Sin nuevos campos en `ScenarioDescriptor` (ya tiene `connectionType`).
- Sin cambios en `OBD_MODE` enum ni en `configuration/index.ts`.

**Non-Goals:**
- No se implementa transporte Bluetooth (queda como placeholder).
- No se unifica `OBD_MODE=tcp` y `OBD_MODE=serial` en un solo modo (fuera de alcance).
- No se añade auto-detección de qué transportes están disponibles (el backend siempre expone los 3; el que no tenga dispositivo físico falla al conectar, y el wizard lo maneja).
- No se modifica `isDirectConnection` (se sigue usando para decidir si `scenarioId` es opcional).

## Decisiones

### Decision 1: `listScenarios()` gana una tercera rama — no un flag nuevo

**Elegido**: Modificar `listScenarios()` para detectar "modo directo multi-escenario":

```ts
listScenarios(): ScenarioDescriptor[] {
    if (this.obdRepo && this.scenarios.length > 0) return this.scenarios
    if (this.obdRepo) return [this.directScenario]
    return this.scenarios
}
```

Cuando `obdRepo` existe Y `scenarios` tiene elementos → modo multi-direct (nuevo). Cuando `obdRepo` existe pero `scenarios` está vacío → modo single-direct (serial, backward compat). Cuando `obdRepo` no existe → modo docker.

**Rechazado**: Añadir un flag `isMultiDirect: boolean` a `DiagnosisServiceOptions`. Introduce estado redundante: la condición ya es derivable de los datos existentes (`obdRepo` + `scenarios.length`). Un flag explícito podría desincronizarse de la realidad.

**Rechazado**: Eliminar `directScenario` y `obdRepo` del constructor y usar siempre `scenarios` + `obdRepos` (incluso para serial). Requeriría cambiar `composition.ts` en la rama serial, tests que asumen el comportamiento actual, y el controller que usa `isDirectConnection`. Demasiado riesgo para el MVP.

### Decision 2: `OBD_MODE=tcp` siempre crea TCP + Serial + Bluetooth (no condicional)

**Elegido**: En la rama `tcp` de `createDiagnosisService`, crear SIEMPRE los 3 escenarios y los 2 transports (TCP y Serial), sin comprobar si `SERIAL_PORT_PATH` está configurado o si el dispositivo existe:

```ts
// WiFi TCP — siempre disponible en modo tcp
const tcpTransport = createElm327TcpClient({ host: config.ELM327_HOST, port: config.ELM327_PORT })
obdRepos.set('tcp-wifi', new Elm327TcpRepository(tcpTransport))

// USB Serial — siempre creado; falla al conectar si no hay dispositivo
const serialTransport = createElm327SerialClient({
  path: config.SERIAL_PORT_PATH ?? '/dev/ttyUSB0',
  baudRate: config.SERIAL_BAUD_RATE ?? 38400,
})
obdRepos.set('serial-usb', new Elm327TcpRepository(serialTransport))

// Bluetooth — placeholder sin transporte
scenarios.push(BLUETOOTH_DIRECT_SCENARIO)
```

**Por qué siempre y no condicional.** Si el backend solo expone WiFi porque `SERIAL_PORT_PATH` no está configurado, el mecánico no ve la opción USB y asume que no existe — cuando en realidad solo necesita enchufar el cable. Es mejor exponer todas las opciones y dejar que el error de conexión (timeout, dispositivo no encontrado) se comunique al usuario en el paso `detecting` del wizard. La UI ya maneja este caso: `DetectingStep` muestra error + botones "Reintentar" y "Elegir otro vehículo".

**Riesgo aceptado**: Si el usuario selecciona USB sin tener un dispositivo conectado, el wizard falla en el paso `detecting` con un error de timeout. El usuario ve el mensaje de error y vuelve atrás para elegir WiFi. Esto es mejor que ocultar la opción USB y forzar al usuario a adivinar que necesita editar `.env`.

### Decision 3: Bluetooth es un escenario sintético sin transporte — `resolveRepository` lanza 404

**Elegido**: `BLUETOOTH_DIRECT_SCENARIO` se añade al array `scenarios` pero NO se añade a `obdRepos`. `obdRepo` NO se pasa al constructor (se deja `undefined`). Cuando el wizard selecciona `bluetooth` y llama a `GET /api/vehicle-info?scenarioId=bluetooth`:

1. `resolveRepository('bluetooth')` → no está en `obdRepos`
2. `this.obdRepo` es `undefined` → lanza `DiagnosisScenarioNotFoundError`
3. Controller devuelve 404 → wizard muestra estado de error recuperable

**Rechazado**: Añadir un `BluetoothUnavailableRepository` que tire errores específicos. Sobrecarga de boilerplate para un placeholder. La UI ya maneja errores genéricos en el paso `detecting`. Cuando se implemente el transporte Bluetooth, se añade al mapa `obdRepos` y el escenario funciona sin más cambios.

**Rechazado**: No incluir Bluetooth hasta que exista el transporte. El usuario pide explícitamente que aparezca en el wizard. Mostrar "Bluetooth (Próximamente)" comunica el roadmap y evita que el mecánico piense que la herramienta no soporta Bluetooth.

### Decision 4: `obdRepo` no se pasa en modo multi-direct → `isDirectConnection = false` → `scenarioId` obligatorio

**Elegido**: No pasar `obdRepo` en la rama `tcp` multi-direct. Esto hace que `isDirectConnection` devuelva `false`, y el controller exija `scenarioId` en todas las peticiones.

**Consecuencia**: En el modo `tcp` actual (single-direct), `scenarioId` es opcional. En el nuevo modo multi-direct, `scenarioId` es obligatorio. Esto es correcto: con múltiples escenarios, el backend necesita saber cuál usar. El wizard siempre pasa `scenarioId` después de la selección, así que el frontend no necesita cambios.

### Decision 5: Los IDs de escenario son `tcp-wifi`, `serial-usb`, `bluetooth`

**Elegido**: IDs descriptivos con guiones, consistentes con el patrón `kebab-case` del proyecto. No colisionan con los IDs docker (`toyota`, `audi-a3-tdi`, `kawasaki-z900`). Los IDs antiguos (`tcp`, `serial`) se conservan en sus respectivos modos single-direct (backward compat), pero no se usan en el nuevo modo multi-direct.

## Riesgos

- **`isDirectConnection = false` en modo multi-direct**: Si algún consumidor asume que `isDirectConnection = true` implica "no necesito pasar scenarioId", fallará. Se revisa el controller: `selectSchema` ya devuelve el schema `required` cuando `isDirectConnection = false`, que es el comportamiento correcto. No hay otros consumidores de `isDirectConnection`.
- **Serial sin dispositivo físico**: `createElm327SerialClient` se crea aunque no haya dispositivo en el puerto. El timeout de conexión puede ser largo (el `serialport` puede tardar varios segundos en fallar). El wizard ya muestra un spinner durante `detecting`, así que la experiencia es aceptable.
- **Dos transports abiertos simultáneamente**: TCP y Serial se crean ambos al arrancar. Si el usuario solo usa WiFi, el puerto serie queda abierto consumiendo recursos. En producción esto es marginal (un file descriptor). Si se convierte en problema, se puede hacer lazy initialization — pero no ahora.
