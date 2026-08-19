# 3. Capa OBD-II / ELM327 — Protocolo, Emulador y Simulación

> **Resumen**: Este capítulo describe la arquitectura de adquisición de datos OBD-II del proyecto *Intelligent Automotive Diagnostics*. Se detalla el protocolo ELM327, los modos de servicio SAE J1979 implementados, el catálogo de fórmulas PID con motor de evaluación aritmética, los dos transportes (TCP real y Docker emulado), el emulador multi-escenario en Docker, el simulador interno para pruebas y el cumplimiento normativo (SAE J1979, ISO 3779, ISO-TP).

---

## Índice

1. [Visión general de la capa OBD](#1-visión-general-de-la-capa-obd)
2. [Transportes: TCP real vs Docker emulado](#2-transportes-tcp-real-vs-docker-emulado)
3. [Protocolo ELM327 — Parsing de respuestas](#3-protocolo-elm327--parsing-de-respuestas)
4. [Modos de servicio OBD-II implementados](#4-modos-de-servicio-obd-ii-implementados)
5. [Catálogo de fórmulas PID](#5-catálogo-de-fórmulas-pid)
6. [Emulador de coche en Docker](#6-emulador-de-coche-en-docker)
7. [Simulador interno](#7-simulador-interno)
8. [Cómo el API consume la capa OBD](#8-cómo-el-api-consume-la-capa-obd)
9. [Cumplimiento normativo](#9-cumplimiento-normativo)
10. [Discrepancias detectadas](#10-discrepancias-detectadas)

---

## 1. Visión general de la capa OBD

```
┌──────────────────────────────────────────────────────────────────┐
│                    APLICACIÓN (DiagnosisService)                  │
│  Usa ObdRepository (puerto de aplicación) para leer:              │
│  PIDs en vivo, DTCs, VIN, freeze frame, estado MIL, ECUs         │
└────────────────────────────────┬─────────────────────────────────┘
                                 │  ObdRepository (interface)
          ┌──────────────────────┼──────────────────────┐
          ▼                      ▼                      ▼
┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
│ Elm327TcpRepo   │  │ DiagnosisService    │  │ ObdSimulatorRepo     │
│ (elm327Adapter) │  │ (single via config) │  │ (simulatorAdapter)   │
│                 │  │                     │  │     SOLO TESTS       │
│ TCP persistente │  │ TCP para 1 coche    │  │ En memoria, sin I/O  │
│ + multi-escen.  │  │ real / emulador     │  │ Escenarios fijos     │
└────────┬────────┘  └──────────┬──────────┘  └──────────┬───────────┘
         │                      │                        │
         ▼                      ▼                        ▼
┌─────────────────┐  ┌─────────────────────┐  ┌──────────────────────┐
│  tcpTransport   │  │   tcpTransport      │  │    ObdSimulator      │
│  Cola FIFO      │  │   (misma factory)   │  │  Genera bytes SAE    │
│  Auto-reconexión│  │                     │  │  desde escenario     │
└────────┬────────┘  └──────────┬──────────┘  └──────────────────────┘
         │                      │
         ▼                      ▼
┌──────────────────────────────────────────────────────────────────┐
│              Emuladores ELM327 en Docker (Python)                │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐           │
│  │ Audi A3  │    │ Kawasaki Z900│    │ Toyota Auris  │           │
│  │ :35000   │    │ :35001       │    │ :35002        │           │
│  └──────────┘    └──────────────┘    └───────────────┘           │
│                                                                  │
│  ...o bien UN coche real con adaptador ELM327 WiFi en :35000     │
└──────────────────────────────────────────────────────────────────┘
```

La capa OBD del proyecto se estructura en tres niveles según Clean Architecture:

| Capa | Directorio | Responsabilidad |
|------|-----------|----------------|
| **Dominio** | `domain/` | `VehicleStatus`, `Vin`, `DtcCode`, `FreezeFrame`, `PidFormulaEntry`, `Formula`, `LiveData`, catálogo DTC (`dtcCatalog`), motor de fórmulas (`services/pidFormula`) |
| **Aplicación** | `application/ports/` | Puerto `ObdRepository` (contrato), `PidFormulaCatalog` (contrato) |
| **Infraestructura** | `infrastructure/elm327/`, `infrastructure/simulation/`, `infrastructure/composition/` | Implementaciones concretas: TCP, simulación, wiring |

El contrato central es la interfaz `ObdRepository` (`apps/core-api/src/application/ports/ObdRepository.ts`), que define **13 métodos** que toda implementación debe satisfacer:

```typescript
// Resumen del contrato — implementación completa en código fuente
interface ObdRepository {
  readPid(mode, pid): number          // Service 01 — leer un PID con fórmula
  readPidRaw(mode, pid, dataBytes)    // Service 01/22 — leer bytes sin fórmula
  getSupportedPids(): string[]        // Service 01 PID 00 — PIDs soportados
  getFreezeFrame(dtc?): FreezeFrame   // Service 02 — freeze frame
  readDtcCodes(): DtcCode[]           // Service 03 — DTCs almacenados
  clearDtcCodes(): void               // Service 04 — borrar DTCs
  readPendingDtcCodes(): DtcCode[]    // Service 07 — DTCs pendientes
  readPermanentDtcCodes(): DtcCode[]  // Service 0A — DTCs permanentes
  readVin(): string                   // Service 09 PID 02 — VIN
  getVehicleInfo(): VehicleInfo       // Info estática del vehículo
  getVehicleStatus(): VehicleStatus   // Service 01 PID 01 — MIL + monitores
  getEcuInfo(): EcuInfo[]             // ECUs descubiertas en bus CAN
  setPower(on: boolean): void         // Alimentación (no-op en software)
}
```

---

## 2. Transportes: TCP real vs Docker emulado

El proyecto soporta **dos modos de transporte**, seleccionados mediante la variable de entorno `OBD_MODE`:

### 2.1 Modo `docker` — Multi-escenario emulado

Cuando `OBD_MODE=docker` (valor por defecto en `docker-compose.yml`), el sistema crea **tres instancias** independientes de `Elm327TcpRepository`, una por cada contenedor emulador:

| Escenario | Contenedor Docker | Puerto | Vehículo emulado |
|-----------|-------------------|--------|-----------------|
| `audi-a3-tdi` | `elm327-audi` | `35000` | Audi A3 2.0 TDI (2018) |
| `kawasaki-z900` | `elm327-kawasaki` | `35001` | Kawasaki Z900 (2020) |
| `toyota` | `elm327-toyota` | `35002` | Toyota Auris Hybrid (2016) |

Cada escenario se expone al frontend como una opción de diagnóstico. El usuario puede cambiar de vehículo en caliente y cada uno tiene su propia conexión TCP persistente independiente.

La lógica de selección se encuentra en `infrastructure/composition/composition.ts` (función `createDiagnosisService`):

```typescript
// Fragmento simplificado de composition.ts (líneas 384-411)
function createDiagnosisService(opts) {
  if (config.OBD_MODE === 'docker') {
    // Modo multi-escenario: un Elm327TcpRepository por contenedor
    const scenarios = createDockerScenarios(config)
    const obdRepos = createObdRepoMap(scenarios)  // Map<id, Elm327TcpRepository>
    return new DiagnosisService({ scenarios, obdRepos, ... })
  }
  // Modo directo: un solo Elm327TcpRepository
  const obdRepo = new Elm327TcpRepository({
    host: config.ELM327_HOST,
    port: config.ELM327_PORT,
  })
  return new DiagnosisService({ scenarios: [], obdRepo, ... })
}
```

### 2.2 Modo directo — Coche real o emulador único

Cuando `OBD_MODE` NO es `docker`, el sistema se conecta a **un único host:puerto** (`ELM327_HOST` / `ELM327_PORT`). Esto permite conectar:

- Un **coche real** con adaptador ELM327 WiFi (ej. Vgate iCar, OBDLink). El adaptador expone un servidor TCP (normalmente en `192.168.0.10:35000`).
- Un **único emulador** en Docker o en red local.

En este modo, el `DiagnosisService` expone un escenario sintético `tcp` con vehículo desconocido (`vehicleType: 'unknown'`), cuyos datos (VIN, DTCs, PIDs) se descubren en tiempo real desde el hardware.

### 2.3 Transporte TCP persistente (`tcpTransport.ts`)

Independientemente del modo, la comunicación con el dispositivo ELM327 se realiza mediante un **cliente TCP persistente** con las siguientes características:

```
┌──────────────────────────────────────────────────────────────────┐
│                  Elm327TcpClient (tcpTransport.ts)               │
│                                                                  │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐                    │
│  │ Cmd 1   │────▶│ Cmd 2   │────▶│ Cmd 3   │  Cola FIFO         │
│  └─────────┘     └─────────┘     └─────────┘                    │
│       │               │               │                         │
│       └───────────────┴───────────────┘                         │
│                       │  Mutex (processQueue)                    │
│                       ▼                                         │
│              ┌────────────────┐                                  │
│              │  Socket TCP    │  Conexión única persistente      │
│              │  host:port     │  Keep-alive habilitado           │
│              └────────────────┘                                  │
│                       │                                         │
│                       ▼                                         │
│    Auto-reconexión con backoff exponencial:                      │
│    • Base 100ms, cap 30s por intento, cap 30s total              │
│    • Reenvía el comando en vuelo tras reconectar                 │
│    • Timeout por comando: 3s (configurable)                     │
│    • Máximo 3 reintentos por comando (configurable)             │
└──────────────────────────────────────────────────────────────────┘
```

**Por qué una conexión persistente**: en iteraciones anteriores se usaban sockets efímeros (uno por comando). Un diagnóstico típico envía 6+ comandos, y abrir/cerrar 6 sockets en rápida sucesión saturaba el adaptador ELM327, causando `NO DATA` o timeouts. La conexión persistente con cola FIFO resuelve este problema serializando todas las escrituras sobre un único socket.

---

## 3. Protocolo ELM327 — Parsing de respuestas

El módulo `infrastructure/elm327/protocol.ts` implementa el parsing de respuestas del adaptador ELM327. No implementa comandos AT (se asume que el dispositivo ya está configurado en modo correcto); solo parsea las respuestas a comandos OBD.

### 3.1 Funciones principales

| Función | Propósito | Ejemplo |
|---------|-----------|---------|
| `parseHexBytes(hex)` | Convierte `"0C 80"` → `[0x0C, 0x80]` | Validación con regex `HEX_TOKEN_RE` |
| `formatCommand(mode, pid)` | Formatea `"01", "0C"` → `"01 0C"` | Soporta PIDs de 4 dígitos: `"22 1130"` |
| `stripEcho(raw)` | Limpia respuesta cruda: elimina eco, prompt `>`, líneas `AT`, `OK` | Respuesta limpia sin ruido |
| `parseModeResponse(raw)` | Mode 01/02: extrae bytes tras `4X YY` | `"41 0C 14 5F"` → `[0x14, 0x5F]` |
| `parseMode22Response(raw, didLen)` | Mode 22 UDS: extrae bytes tras `62 XX XX` | `"62 11 30 03 20"` → `[0x03, 0x20]` |
| `parseVinResponse(raw)` | Mode 09 PID 02: extrae 17 bytes ASCII del VIN | Soporta multi-línea (`0:`, `1:`, ...) y single-line |
| `parseDtcResponse(raw, mode)` | Mode 03/07/0A: extrae pares de bytes DTC | `"43 03 01 04 01"` → `[[0x03,0x01], [0x04,0x01]]` |
| `parseSupportedPidBitmask(bytes)` | Mode 01 PID 00: decodifica bitmask de PIDs soportados | `[0xB8, 0x3B, ...]` → `["01 01", "01 03", ...]` |

### 3.2 Formato de respuesta ELM327

Sin headers (por defecto en el emulador):
```
01 0C              ← eco del comando
41 0C 14 5F        ← respuesta: mode 41, PID 0C, datos 0x14 0x5F
>                  ← prompt
```

Con headers (`AT H1`):
```
7E8 04 41 0C 14 5F  ← ECU 7E8, 4 bytes, mode 41, PID 0C, datos
```

| Campo | Significado |
|-------|-------------|
| `7E8` | ID de ECU respondedora (respuesta a petición `7E0`) |
| `04` | Número de bytes de datos |
| `41` | Mode 0x01 + 0x40 = respuesta |
| `0C` | PID (RPM) |
| `14 5F` | Datos: `(0x14 × 256 + 0x5F) / 4 = 1303,75 RPM` |

### 3.3 Jerarquía de errores

```
Elm327ConnectionError   ← Fallo de socket TCP / timeout / desconexión
Elm327NoDataError        ← El dispositivo respondió "NO DATA"
Elm327ParseError         ← Respuesta ilegible o malformada
```

El `Elm327ConnectionError` incluye un flag `connectionLost` que el `tcpTransport` usa para distinguir entre "conexión perdida" (dispara auto-reconexión, reenvía el comando) y "timeout de comando" (reintenta con backoff, máximo 3 intentos).

---

## 3.4 Protocolos de bus soportados

Un modo de servicio dice **qué se pregunta**; el protocolo dice **en qué idioma**. Son dos
ejes independientes, y conviene no confundirlos: los modos de la sección 4 funcionan en
todos los protocolos de esta tabla.

| Nº | Protocolo | Típico en | Lectura de PID/DTC/VIN | Barrido de ECUs |
|---|---|---|---|---|
| 1 | SAE J1850 PWM | Ford hasta ~2003 | ✅ Sí | ❌ No |
| 2 | SAE J1850 VPW | GM hasta ~2005 | ✅ Sí | ❌ No |
| 3 | ISO 9141-2 | Europeos y asiáticos hasta ~2004 | ✅ Sí | ❌ No |
| 4 | ISO 14230-4 KWP (init lento) | ~2003–2008, muchas motos | ✅ Sí | ❌ No |
| 5 | ISO 14230-4 KWP (init rápido) | Ídem | ✅ Sí | ❌ No |
| **6** | **ISO 15765-4 CAN 11 bits / 500 kbps** | **Mayoría desde 2008** | ✅ Sí | ✅ Sí |
| 7 | ISO 15765-4 CAN 29 bits / 500 kbps | Americanos y algún europeo | ✅ Sí | ✅ Sí |
| 8 | ISO 15765-4 CAN 11 bits / 250 kbps | Híbridos y vehículo ligero | ✅ Sí | ✅ Sí |
| 9 | ISO 15765-4 CAN 29 bits / 250 kbps | Raro en turismos | ✅ Sí | ✅ Sí |
| A | SAE J1939 | Camiones y maquinaria | — | ❌ No |

### 3.4.1 El bitrate no lo fija este proyecto

Hay dos velocidades en juego y solo una es nuestra:

| | Entre qué y qué | Quién la fija | Valor |
|---|---|---|---|
| Baudios del enlace serie | Portátil ↔ adaptador ELM327 | La aplicación (`SERIAL_BAUD_RATE`) | 38400 |
| Bitrate del bus CAN | Adaptador ↔ vehículo | **El adaptador, solo** | 500 o 250 kbps |

El ELM327 tiene su propio controlador CAN y lo configura al seleccionar el protocolo:
elegir el 6 *es* elegir 11 bits a 500 kbps. No son dos ajustes. El `ATSP0` de la secuencia
de negociación (`initSequence.ts`) le dice que los pruebe todos y se quede con el que
conteste, y `AT DPN` pregunta después cuál eligió.

Esto importa porque hasta la revisión de agosto de 2026 el barrido de ECUs emitía `AT SP 6`,
que era el único punto donde el código decidía la velocidad del bus — a ciegas y sin
deshacerlo. En un vehículo que no fuera protocolo 6 dejaba el adaptador fijado a un bus que
el coche no habla, y con él caían también las lecturas normales. Ver
[ADR 009](../adr/009-negociacion-de-protocolo-obd.md).

### 3.4.2 Por qué el barrido solo existe en CAN

El descubrimiento de ECUs pregunta a la dirección de broadcast funcional y recoge quién
contesta. Esa dirección es propia de ISO 15765-4 —`7DF` en 11 bits, `18DB33F1` en 29— y no
tiene equivalente directo en los protocolos anteriores, donde el direccionamiento y la
inicialización son otra cosa.

Fuera de CAN, `discoverEcus` devuelve una lista vacía **sin emitir ningún comando de
configuración**. Abstenerse es deliberado: es lo que garantiza que la telemetría, los
códigos de avería y el VIN sigan funcionando en un coche antiguo.

---

## 4. Modos de servicio OBD-II implementados

### 4.1 Tabla completa de modos

| Service | Hex | Nombre SAE J1979 | Implementado | Método en `ObdRepository` |
|---------|-----|-----------------|-------------|---------------------------|
| **01** | `0x01` | Current Data | ✅ Sí | `readPid()`, `readPidRaw()`, `getSupportedPids()`, `getVehicleStatus()` |
| **02** | `0x02` | Freeze Frame Data | ✅ Sí | `getFreezeFrame(dtc?)` |
| **03** | `0x03` | Stored DTCs | ✅ Sí | `readDtcCodes()` |
| **04** | `0x04` | Clear DTCs | ✅ Sí | `clearDtcCodes()` (no-op en simulación) |
| **05** | `0x05` | O2 Sensor Tests (non-CAN) | ❌ No | Fuera del scope (pre-CAN) |
| **06** | `0x06` | Test Results (other) | ❌ No | Complejo, específico de emisiones |
| **07** | `0x07` | Pending DTCs | ✅ Sí | `readPendingDtcCodes()` |
| **08** | `0x08` | Control Operations | ❌ No | Fuera del scope (actuadores) |
| **09** | `0x09` | Vehicle Information | ✅ Sí | `readVin()` (PID 02) |
| **0A** | `0x0A` | Permanent DTCs | ✅ Sí | `readPermanentDtcCodes()` |
| **22** | `0x22` | UDS ReadDataByIdentifier | ✅ Sí | `readPid()` y `readPidRaw()` con `mode='22'` |

### 4.2 Detalle de modos implementados

**Mode 01 — Current Data**. Lee PIDs en tiempo real. El PID 00 devuelve un bitmask de 4 bytes indicando qué PIDs del rango 01-20 están soportados. El PID 01 devuelve 4 bytes con estado MIL, conteo de DTCs y monitores de emisiones. Los PIDs de sensores (05, 0C, 0D, 0F, etc.) se decodifican aplicando la fórmula SAE J1979 correspondiente desde el `PidFormulaCatalog`.

```typescript
// Ejemplo de lectura de RPM desde Elm327TcpRepository
async readPid(mode: string, pid: string): Promise<number> {
  const entry = this.pidFormulas.get(mode, pid)           // Busca la fórmula
  const bytes = await this.fetchPidBytes(mode, pid, ...)  // Envía "01 0C" por TCP
  return this.pidFormulas.apply(mode, pid, bytes)         // Aplica "(A*256+B)/4"
}
```

**Mode 02 — Freeze Frame**. Lee los PIDs 04, 05, 0C, 0D, 11 (carga motor, temperatura refrigerante, RPM, velocidad, posición acelerador) del momento en que se disparó un DTC. Implementa **degradación graceful**: si un PID concreto devuelve `NO DATA`, no invalida el resto del freeze frame.

**Mode 03 — Stored DTCs**. Lee códigos de avería confirmados. Cada DTC se transmite como 2 bytes en el bus CAN. `DtcCode.decodeFromBytes()` decodifica el par según SAE J2012 — el primer byte codifica la categoría (P/C/B/U) y los dígitos 1-2; el segundo byte codifica los dígitos 3-4.

```
Byte 1: 0x03 → Categoría P (bits 7-6 = 00), dígitos 0-3
Byte 2: 0x01 → dígitos 0-1
Resultado: P0301 (Cylinder 1 Misfire)
```

**Mode 07 — Pending DTCs**. DTCs detectados pero aún no confirmados (requieren varios ciclos de conducción).

**Mode 0A — Permanent DTCs**. DTCs que no se pueden borrar con Mode 04 (requieren reparación + ciclos de conducción).

**Mode 09 PID 02 — VIN**. Lee los 17 caracteres ASCII del VIN. Soporta dos formatos de respuesta:
- **Multi-línea**: cada línea con prefijo `0:`, `1:`, `2:`, `3:` conteniendo bytes hex ASCII
- **Single-line**: respuesta compacta `49 02 01 XX XX ...`

**Mode 22 — UDS ReadDataByIdentifier**. PIDs propietarios de fabricante. El protocolo de respuesta es distinto: en lugar de `4X YY`, usa `62 XX XX` seguido del payload. Implementado para Toyota (odómetro TCU/ECM, batería híbrida) y VAG/Audi (16 DIDs del motor TDI EA288).

---

## 5. Catálogo de fórmulas PID

### 5.1 Motor de fórmulas (Shunting-yard)

El proyecto implementa un **parser y evaluador aritmético completo** para fórmulas PID en `domain/services/pidFormula.ts`. Usa el algoritmo **Shunting-yard** (Dijkstra) para convertir expresiones de notación infija a postfija (RPN), y luego evalúa la notación postfija sobre los bytes reales de la respuesta OBD.

**Sintaxis soportada**:
- Variables `A` a `H` (bytes de la trama, indexados por orden alfabético)
- Constante `raw` (valor big-endian de todos los bytes)
- Operadores aritméticos: `+`, `-`, `*`, `/`, `<<`, `>>`, `|`, `&`
- Paréntesis para agrupación
- Números decimales (ej. `0.5`, `100/255`)

**Ejemplos de fórmulas del catálogo**:

| PID | Nombre | Fórmula | Ejemplo con bytes | Resultado |
|-----|--------|---------|-------------------|-----------|
| `01 0C` | RPM | `(A*256+B)/4` | `[0x14, 0x5F]` → A=20, B=95 | 1303,75 rpm |
| `01 05` | Coolant Temp | `A-40` | `[0x5A]` → A=90 | 50°C → **90°C** |
| `01 11` | Throttle Position | `A*100/255` | `[0x80]` → A=128 | 50,2% |
| `22 0300` | TCU Odometer | `(A<<24\|B<<16\|C<<8\|D)/10` | `[0x00, 0x03, 0xC0, 0xB8]` | 24594,4 km |
| `22 F477` | Fuel Rail Pressure | `(A*256+B)*0.01` | `[0x6D, 0x60]` → A=109, B=96 | 280,00 bar |

> **Nota**: Las temperaturas OBD-II se transmiten con **offset de −40°C**. El valor 0x5A (90 decimal) del refrigerante representa 90°C reales porque la fórmula `A-40` no aplica al emulador, que ya entrega la temperatura en grados Celsius directamente. En un coche real, 90°C se transmitiría como `0x82` (130 decimal, 130−40=90).

### 5.2 Catálogo de PIDs semilla

El fichero `infrastructure/persistence/sqlite/seed-pids.ts` contiene **16 PIDs** universales SAE J1979 (Mode 01), aplicables a cualquier vehículo:

| Grupo | Cantidad | Modo | Descripción |
|-------|----------|------|-------------|
| `STANDARD_MODE_01_PIDS` | 16 | 01 | PIDs SAE J1979 globales (todos los vehículos) |

Los PIDs **propietarios de fabricante (Mode 22)** y los **DTCs manufacturer-specific** ya **no viven en código**: se siembran en la BD en runtime vía `seedManufacturerCatalog.ts` (idempotente, `source: 'seed'`) en las tablas `pid_definitions` y `dtc_definitions`. El VIN (Service 09 PID 02) se lee por `readVin`/`parseVinResponse`, no por el catálogo de fórmulas.

Cada entrada del catálogo es un `PidDefinition` con:

```typescript
interface PidDefinition {
  pidCode: PidCode          // Value Object { mode: '01', pid: '0C' }
  name: string              // "Engine RPM"
  formula: Formula          // Value Object validado sintácticamente
  unit: string              // "rpm"
  dataBytes: number         // Bytes esperados en la respuesta
  pidType: 'formula'|'ascii'|'bitmask'  // Tipo de decodificación
  confidence: number        // 0..1 confianza en la fórmula
  source: 'manual'|'seed'|'auto'|'llm_guess'  // Origen del PID
  description?: string      // Descripción extendida
  minValue?: number         // Rango mínimo (para validación UI)
  maxValue?: number         // Rango máximo
}
```

### 5.3 Catálogo de descripciones DTC

El módulo `domain/dtcCatalog.ts` contiene un **diccionario de códigos DTC estándar SAE J2012** (P0xxx) con sus descripciones en inglés, cubriendo:

- **P00xx**: Fuel and Air Metering (MAF, MAP, IAT, O2 sensors)
- **P02xx**: Injector circuits, turbo
- **P03xx**: Misfire, knock, crankshaft/camshaft sensors
- **P04xx**: EGR, catalyst, EVAP, fuel level
- **P05xx**: Vehicle speed, idle control
- **P06xx**: ECM/PCM internal, generator, VIN mismatch
- **P07xx**: Transmission

Los DTCs **manufacturer-specific** (P1xxx VAG, P2xxx diesel) ya **no están en código**: se siembran en la BD (`dtc_definitions`, `source: 'seed'`) y el `elm327Adapter` resuelve su descripción desde BD cuando `dtcDescribe` no acierta. El sistema **nunca inventa** descripciones: el hueco que no cubre ni el catálogo ni la BD lo rellena el índice vectorial (LanceDB) y el LLM durante el diagnóstico cognitivo.

---

## 6. Emulador de coche en Docker

### 6.1 ¿Qué es?

El proyecto utiliza **[ELM327-emulator v3.0.5](https://github.com/Ircama/ELM327-emulator)** (Python) como sidecar Docker. Este emulador **habla el protocolo ELM327 real**: acepta comandos AT y OBD-II por TCP, y responde con tramas CAN 11-bit correctamente formateadas (headers, ISO-TP flow control para multi-frame).

### 6.2 Arquitectura de despliegue

```
docker-compose.yml
├── elm327-audi     (puerto 35000)  ← Escenario Audi A3 2.0 TDI
├── elm327-kawasaki (puerto 35001)  ← Escenario Kawasaki Z900
├── elm327-toyota   (puerto 35002)  ← Escenario Toyota Auris Hybrid
└── api             (puerto 4000)   ← Backend Node.js/Express
```

Cada contenedor comparte la misma imagen Docker (`docker/elm327/Dockerfile`) pero se especializa mediante la variable `SCENARIO_SCRIPT`:

```
docker/elm327/
├── Dockerfile           ← Python 3.11-slim + ELM327-emulator
├── run_audi.py          ← Parchea escenario Audi, arranca en :35000
├── run_kawasaki.py      ← Parchea escenario Kawasaki, arranca en :35001
├── run_toyota.py        ← Parchea VIN/DIDs Toyota, arranca en :35002
└── scenarios/
    ├── audi_a3_tdi.py   ← ~25 PIDs SAE + 16 DIDs VAG Mode 22
    └── kawasaki_z900.py ← Escenario personalizado Kawasaki
```

### 6.3 Cómo funciona cada escenario

**Audi A3 2.0 TDI** (escenario por defecto). El script `run_audi.py` inyecta el diccionario `audi_a3_tdi.ObdMessage` en el namespace del emulador antes de arrancar. Expone:

- **Mode 01**: 25 PIDs SAE J1979 enfocados a motor diésel (sin fuel trim ni spark advance). Incluye: RPM, velocidad, temperatura refrigerante, MAP/boost, MAF, EGR, presión atmosférica, temperatura aceite, nivel combustible, tipo combustible = diésel, etc.
- **Mode 22**: 16 DIDs VAG documentados por la comunidad Ross-Tech/VCDS para el motor EA288 CR: velocidad motor (`1130`), presión boost real/especificada (`115C`/`115E`), temperatura refrigerante (`F430`), presión rail combustible real/especificada (`F477`/`F47D`), EGR (`1035`), par motor (`1250`), cantidad inyección (`1132`), masa DPF (`1410`), presión diferencial DPF (`140E`), posición pedal acelerador (`F449`), voltaje batería (`1462`), velocidad vehículo (`F40D`).

**Toyota Auris Hybrid**. Usa el escenario `car` integrado del emulador (~25 PIDs, motor gasolina con fuel trim y spark advance). El script `run_toyota.py` parchea:
- VIN: `JTDKN3DU60A123456`
- DID `0300`: TCU Odometer (`24594.4 km`)
- DID `0400`: ECM Odometer (`10000 km`)

**Kawasaki Z900**. Escenario personalizado (`scenarios/kawasaki_z900.py`). Corre en `:35001`.

### 6.4 Limitaciones del emulador

- **Licencia CC-BY-NC-SA-4.0**: no permite uso comercial. Por eso se despliega como sidecar externo, no como dependencia del backend.
- **Requiere stdin abierto**: el Dockerfile usa `tail -f /dev/null | exec python ...` para mantener vivo el proceso.
- **El escenario `car` solo expone ~25 PIDs** de los ~80 del estándar. No cubre todos los casos de prueba.
- **No es multi-ECU real**: aunque el emulador soporta multi-ECU, solo se usa la ECU `7E0` → `7E8` (Engine Control Module).

---

## 7. Simulador interno

### 7.1 Propósito y uso

El **simulador interno** (`infrastructure/simulation/`) es un generador de datos OBD-II **en memoria, sin I/O de red**. Su función es permitir pruebas unitarias y de integración sin depender de Docker ni de hardware.

> ⚠️ **Importante**: `ObdSimulatorRepository` NO se instancia en producción. El fichero `composition.ts` solo crea `Elm327TcpRepository`. El simulador solo existe en tests (`*.test.ts` y `*.spec.ts`).

### 7.2 Componentes

```
simulation/
├── scenario.ts         ← Interfaz SimulationScenario
├── seedScenarios.ts    ← 2 escenarios predefinidos (Audi idle, Kawasaki)
├── simulator.ts        ← ObdSimulator: genera bytes SAE J1979 desde escenario
└── simulatorAdapter.ts ← ObdSimulatorRepository: implementa ObdRepository
```

### 7.3 Escenario de simulación

```typescript
interface SimulationScenario {
  id: string                  // "audi-a3-idle"
  name: string                // "Audi A3 al ralentí"
  vehicleType: VehicleType    // Car | Motorcycle
  sensorValues: LiveData      // { rpm, coolantTemp, speed, intakeTemp }
  dtcConfig: DtcCode[]        // Ej: [{ code: "P0301", description: "..." }]
  vehicleInfo: VehicleInfo    // { make, model, year, engineType, vin }
  pidValues?: Record<string, number>   // PIDs extra con valores fijos
  freezeFrame?: FreezeFrame   // Datos congelados opcionales
  ecus?: EcuInfo[]            // ECUs simuladas (ECM, TCM, ABS...)
}
```

### 7.4 Escenarios predefinidos (`seedScenarios.ts`)

**Audi A3 al ralentí** (`audi-a3-idle`):
- Motor 2.0 TFSI gasolina, 750 RPM, 90°C refrigerante, 0 km/h, 25°C admisión
- DTC: `P0301` (Cylinder 1 Misfire)
- PIDs extra: acelerador 14%, carga motor 18%, voltaje módulo 14.2V
- 5 ECUs: ECM, TCM, ABS, BCM, SRS

**Kawasaki Z900** (`kawa-z900`):
- Motor 948cc, 4500 RPM, 105°C refrigerante, 0 km/h, 28°C admisión
- Sin DTCs
- PIDs extra: acelerador 52%, carga motor 58%, voltaje módulo 10.9V (fallo de carga)
- 3 ECUs: ECM, ABS, IPC

### 7.5 Generación de datos coherentes

El `ObdSimulator` convierte los valores del escenario a bytes SAE J1979 reales aplicando la **codificación inversa** de cada PID:

```typescript
// simulator.ts — readPidRawBytes
readPidRawBytes(mode, pid): number[] {
  switch (pid) {
    case '0C':  // RPM: valor_físico × 4 → 2 bytes big-endian
      const raw = Math.round(sv.rpm * 4)
      return [Math.floor(raw / 256), raw % 256]
    case '05':  // Coolant temp (el simulador ya entrega °C, sin offset)
      return [sv.coolantTemp]  // El emulador ya corrige el offset
    case '0D':  // Speed: 1 byte directo
      return [sv.speed]
    case '0F':  // Intake temp
      return [sv.intakeTemp]
  }
}
```

El `VehicleStatus` simulado siempre reporta **MIL apagado, 0 averías, todos los monitores completados** (función `VehicleStatus.clean()`), independientemente de los DTCs configurados. Esto es deliberado: el simulador modela escenarios fijos, no el comportamiento dinámico de una ECU real.

---

## 8. Cómo el API consume la capa OBD

### 8.1 Flujo de una lectura de PID en vivo

```
Frontend                    API (Express)               Capa OBD
───────                     ─────────────               ────────
GET /api/live-data ──────▶ DiagnosisController ──────▶ DiagnosisService
                           .getLiveData(scenarioId)     .readLiveData(obdRepo)
                                                        │
                           ◀────────── LiveData ────────┤
                           { rpm, coolantTemp,          │
                             speed, intakeTemp }        │
                                                        │
                                                        ├─▶ obdRepo.readPid('01','0C')
                                                        │   tcpTransport.sendCmd("01 0C\r\n")
                                                        │   ◀── "41 0C 14 5F\r>"
                                                        │   parseModeResponse() → [0x14,0x5F]
                                                        │   pidFormulas.apply('01','0C', [20,95])
                                                        │   (20*256+95)/4 = 1303.75
                                                        │
                                                        ├─▶ obdRepo.readPid('01','05')
                                                        ├─▶ obdRepo.readPid('01','0D')
                                                        └─▶ obdRepo.readPid('01','0F')
```

En modo `docker`, el `DiagnosisService` selecciona el `Elm327TcpRepository` correspondiente al `scenarioId` solicitado por el frontend. En modo directo, siempre usa la misma instancia.

### 8.2 Lectura de VIN

```typescript
// Elm327TcpRepository.readVin()
async readVin(): Promise<string> {
  const raw = await this.client.sendCommand('09 02')     // Envía comando
  return Vin.fromBytes(parseVinResponse(raw)).value      // Parsea y valida
}
```

El VIN se valida contra ISO 3779 (17 caracteres, sin I/O/Q, check digit opcional en Europa). Si falla, se devuelve `FALLBACK_VIN = 'XXXXXXXXXXXXXXXXX'` con `vinStatus: 'unsupported'` o `'unreadable'`.

### 8.3 Descubrimiento de PIDs soportados

El `Elm327TcpRepository.getSupportedPids()` envía `01 00`, parsea los 4 bytes de respuesta como bitmask, y devuelve la lista de PIDs soportados:

```typescript
// Ejemplo: bytes [0xB8, 0x3B, 0xA8, 0x13]
// Byte 0 = 0xB8 = 10111000 → PIDs 01, 03, 04, 05 soportados
// Byte 1 = 0x3B = 00111011 → PIDs 09, 0A, 0B, 0D, 0E soportados
// ...
// → ["01 01", "01 03", "01 04", "01 05", "01 09", ...]
```

### 8.4 ECUs y direccionamiento CAN

El `Elm327TcpRepository.getEcuInfo()` devuelve actualmente `[]`: el descubrimiento real de ECUs (nombres, direcciones CAN, protocolo) aún no está implementado para el transporte ELM327 real. El simulador interno sí modela múltiples ECUs (hasta 6 en el escenario Audi) a través de `ObdSimulatorRepository` → `simulator.getEcus()`, y el MCP persiste las ECUs descubiertas en la tabla `ecus` cuando hay sesión activa (`persistEcus`, con deduplicación por direcciones CAN).

### 8.5 DTCs y Freeze Frame

El `DiagnosisService` obtiene los DTCs llamando a `obdRepo.readDtcCodes()`, que envía `03` (sin PID — el comando Mode 03 no lleva PID), parsea los pares de bytes con `parseDtcResponse()`, y los convierte a `DtcCode` con descripción del catálogo `dtcDescribe()`.

El freeze frame se lee con Mode 02, iterando 5 PIDs (04, 05, 0C, 0D, 11). Si un PID falla con `NO DATA`, se omite — el freeze frame se entrega con los PIDs que sí respondieron.

---

## 9. Cumplimiento normativo

### 9.1 SAE J1979 — Modos de servicio

| Aspecto | Estado | Detalle |
|---------|--------|---------|
| Mode 01 — Current Data | ✅ Implementado | 16 PIDs estándar con fórmulas SAE J1979 |
| Mode 02 — Freeze Frame | ✅ Implementado | 5 PIDs, degradación graceful |
| Mode 03 — Stored DTCs | ✅ Implementado | Decodificación SAE J2012 |
| Mode 04 — Clear DTCs | ✅ Implementado | No-op en simulación, funcional en TCP |
| Mode 07 — Pending DTCs | ✅ Implementado | (ADR 005 documenta como NO implementado — ver §10) |
| Mode 09 — Vehicle Info | ✅ Implementado | PID 02 (VIN) |
| Mode 0A — Permanent DTCs | ✅ Implementado | (ADR 005 documenta como NO implementado — ver §10) |
| Mode 22 — UDS (propietario) | ✅ Implementado | Toyota (4 DIDs), VAG/Audi (16 DIDs) |
| Mode 05, 06, 08 | ❌ No implementado | Fuera del scope del TFM |

### 9.2 ISO 3779 — Validación VIN

Implementado en `domain/value-objects/vin.ts`:

- ✅ 17 caracteres exactos
- ✅ Caracteres prohibidos I, O, Q
- ✅ Solo mayúsculas A-Z y dígitos 0-9
- ✅ Check digit (posición 9): algoritmo de transliteración + pesos + módulo 11
- ✅ Decodificación WMI (primeros 3 caracteres): país, región, fabricante
- ✅ Tabla de año de modelo (posición 10): ciclo 2001-2030
- ✅ Conversión automática minúsculas → mayúsculas

### 9.3 ISO 15765-2 (ISO-TP) — Capa de transporte CAN

**Estado: NO implementado.** El ADR 008 (estado "Propuesto") describe un módulo `infrastructure/obd/isotp/` con reassembler y segmenter de tramas CAN multi-frame. Este módulo **no existe en el código**:

- No hay directorio `infrastructure/obd/isotp/`
- No hay imports de ISO-TP en ningún fichero
- El parsing de VIN multi-línea en `parseVinResponse()` delega implícitamente el reensamblado al adaptador ELM327, que maneja ISO-TP internamente
- Para leer el VIN (19 bytes de payload, > 7 bytes útiles de un Single Frame CAN), el emulador ELM327 Python se encarga de la segmentación/reensamblado

**Implicación práctica**: el sistema funciona correctamente con el emulador Docker (que implementa ISO-TP) y con adaptadores ELM327 WiFi reales (que también lo implementan). No funcionaría con un transceptor CAN raw sin capa ELM327 intermedia.

---

## 10. Discrepancias detectadas

Esta sección compara los documentos de arquitectura (ADR 004, 005, 008) y la documentación de infraestructura (`docs/infrastructure/elm327-emulator.md`) contra el **código real** inspeccionado.

### 10.1 ADR 005 vs código real — Modos 07 y 0A

| Documento | Realidad |
|-----------|----------|
| ADR 005 §"Services SAE J1979 NO implementados" lista Mode 07 y Mode 0A como **no implementados** | El código implementa ambos: `readPendingDtcCodes()` (mode 07) y `readPermanentDtcCodes()` (mode 0A) en `Elm327TcpRepository`, `ObdSimulatorRepository` y el puerto `ObdRepository` |

**Conclusión**: Los modos 07 (Pending DTCs) y 0A (Permanent DTCs) se implementaron con posterioridad al ADR 005 sin actualizar el documento. La implementación es funcional: `fetchDtcCodes` acepta `'07'` y `'0A'` además de `'03'`, y `parseDtcResponse` calcula el header de respuesta correcto (`47` para mode 07, `4A` para mode 0A).

### 10.2 ADR 004 vs código real — Simulador TypeScript

| Documento | Realidad |
|-----------|----------|
| ADR 004 menciona "construir nuestra propia implementación TypeScript (`infrastructure/elm327-simulator/`)" como objetivo futuro | El directorio `infrastructure/elm327-simulator/` **no existe**. En su lugar existe `infrastructure/simulation/` con el `ObdSimulator`, que es un simulador en memoria (no habla protocolo ELM327 real sobre TCP) |
| ADR 004 dice que el emulador usa escenario `car` (Toyota Auris Hybrid) | El Dockerfile actual tiene `SCENARIO_SCRIPT=run_audi.py` (Audi A3 TDI) como valor por defecto |
| ADR 004 menciona "ISO-TP flow control" como capacidad del futuro simulador TypeScript | ISO-TP no se ha implementado ni en el simulador ni como módulo independiente |

**Conclusión**: El plan original de construir un emulador ELM327 propio en TypeScript no se materializó. En su lugar, el proyecto depende del emulador Python como sidecar Docker, y mantiene un simulador en memoria para pruebas. El nombre `infrastructure/elm327-simulator/` nunca se usó.

### 10.3 ADR 008 vs código real — ISO-TP no implementado

| Documento | Realidad |
|-----------|----------|
| ADR 008 (estado "Propuesto") describe tests unitarios: "24 casos entre frameTypes, reassembler y segmenter" | Los tests **no existen**. No hay ficheros de test de ISO-TP en el proyecto. |
| ADR 008 propone el módulo en `infrastructure/obd/isotp/` | El directorio **no existe** |
| ADR 008 menciona "El reassembler permite leer VINs y otros payloads multi-frame desde cualquier adaptador OBD" | La lectura de VIN funciona delegando en el ELM327 (emulador o adaptador real), que maneja ISO-TP internamente |

**Conclusión**: ADR 008 es una propuesta no ejecutada. El estado "Propuesto" es correcto. La funcionalidad multi-frame (necesaria para leer el VIN de 19 bytes) se satisface mediante delegación al hardware/emulador.

### 10.4 `docs/infrastructure/elm327-emulator.md` vs código real

| Documento | Realidad |
|-----------|----------|
| Menciona comandos AT (`AT SP 0`, `AT H1`) como parte del troubleshooting | `Elm327TcpRepository` **nunca envía comandos AT**. Asume que el emulador ya está en el modo correcto (eco desactivado, sin headers). El script `send-obd.ts` tampoco envía AT. |
| Dice que el emulador soporta "Multi-ECU" con "CAN 11-bit" | En la práctica, el `Elm327TcpRepository.getEcuInfo()` devuelve `[]` (descubrimiento de ECUs aún no implementado para ELM327 real). El multi-ECU no se aprovecha. |
| Menciona "escenario `default`" y "escenario `mt05`" como disponibles | El `docker-compose.yml` solo despliega 3 contenedores: `audi-a3-tdi`, `kawasaki-z900` y `car` (Toyota). Los escenarios `default` y `mt05` no están desplegados. |

### 10.5 Simulador interno no usado en producción

| Expectativa razonable | Realidad |
|-----------------------|----------|
| El `ObdSimulatorRepository` podría usarse como fallback o modo desarrollo | Solo se instancia en tests. `composition.ts` nunca lo crea. La variable `OBD_MODE` solo tiene dos ramas: `docker` y (cualquier otra cosa → TCP directo). No existe `OBD_MODE=simulation`. |

### 10.6 Resumen de discrepancias

| # | Discrepancia | Impacto |
|---|-------------|---------|
| 1 | ADR 005 dice que Mode 07 y 0A no están implementados, pero SÍ lo están | Documentación desactualizada — el código es más completo que lo documentado |
| 2 | ADR 004 menciona `infrastructure/elm327-simulator/` — no existe | El nombre planeado nunca se materializó |
| 3 | ADR 004 dice que el escenario por defecto es `car` (Toyota) — ahora es `audi-a3-tdi` | Cambio de configuración no reflejado en ADR |
| 4 | ADR 008 describe ISO-TP con 24 tests — nada de esto existe | ADR 008 es puramente propositivo, no implementado |
| 5 | `docs/infrastructure/elm327-emulator.md` menciona comandos AT que el código no usa | Documentación no refleja el uso real del adaptador |
| 6 | `ObdSimulatorRepository` nunca se usa en composición de producción | El simulador solo existe para tests — no hay modo simulación sin Docker |

---

## Referencias

### Archivos de código inspeccionados

| Ruta | Rol |
|------|-----|
| `apps/core-api/src/infrastructure/elm327/protocol.ts` | Parsing de respuestas ELM327 |
| `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` | Adaptador TCP → ObdRepository |
| `apps/core-api/src/infrastructure/elm327/tcpTransport.ts` | Cliente TCP persistente con cola FIFO |
| `apps/core-api/src/infrastructure/elm327/pidFormulaCatalog.ts` | Catálogo de fórmulas PID (infraestructura) |
| `apps/core-api/src/infrastructure/elm327/errors.ts` | Jerarquía de errores ELM327 |
| `apps/core-api/src/infrastructure/simulation/simulator.ts` | Generador de tramas OBD-II en memoria |
| `apps/core-api/src/infrastructure/simulation/simulatorAdapter.ts` | Adaptador simulador → ObdRepository |
| `apps/core-api/src/infrastructure/simulation/scenario.ts` | Interfaz SimulationScenario |
| `apps/core-api/src/infrastructure/simulation/seedScenarios.ts` | Escenarios predefinidos |
| `apps/core-api/src/infrastructure/composition/composition.ts` | Wiring: selección OBD_MODE |
| `apps/core-api/src/infrastructure/persistence/sqlite/seed-pids.ts` | Catálogo de 16 PIDs semilla (universales Mode 01) |
| `apps/core-api/src/infrastructure/persistence/sqlite/seedManufacturerCatalog.ts` | Seed idempotente: 20 PIDs Mode 22 + 23 DTCs manufacturer en BD |
| `apps/core-api/src/domain/pids.ts` | Constantes: modos y PIDs |
| `apps/core-api/src/domain/pidFormulaEntry.ts` | Entidad PidFormulaEntry |
| `apps/core-api/src/domain/services/pidFormula.ts` | Motor Shunting-yard |
| `apps/core-api/src/domain/value-objects/formula.ts` | Value Object Formula |
| `apps/core-api/src/domain/value-objects/vin.ts` | Value Object VIN (ISO 3779) |
| `apps/core-api/src/domain/value-objects/vehicleStatus.ts` | Value Object VehicleStatus (SAE J1979) |
| `apps/core-api/src/domain/value-objects/vehicleInfo.ts` | Value Object VehicleInfo |
| `apps/core-api/src/domain/value-objects/dtcCode.ts` | Value Object DtcCode (SAE J2012) |
| `apps/core-api/src/domain/value-objects/freezeFrame.ts` | Value Object FreezeFrame |
| `apps/core-api/src/domain/value-objects/liveData.ts` | Value Object LiveData |
| `apps/core-api/src/domain/value-objects/pidCode.ts` | Value Object PidCode |
| `apps/core-api/src/domain/dtcCatalog.ts` | Catálogo de descripciones DTC estándar (P0xxx, SAE J2012) |
| `apps/core-api/src/domain/entities/ecuInfo.ts` | Entidad EcuInfo |
| `apps/core-api/src/application/ports/ObdRepository.ts` | Puerto ObdRepository |
| `apps/core-api/src/application/ports/PidFormulaCatalog.ts` | Puerto PidFormulaCatalog |
| `scripts/send-obd.ts` | Script de prueba: enviar comando OBD |
| `scripts/scan-pids.ts` | Script de prueba: escanear PIDs soportados |
| `docker/elm327/Dockerfile` | Imagen Docker del emulador |
| `docker/elm327/run_audi.py` | Script de arranque Audi |
| `docker/elm327/run_kawasaki.py` | Script de arranque Kawasaki |
| `docker/elm327/run_toyota.py` | Script de arranque Toyota |
| `docker-compose.yml` | Orquestación de servicios |

### ADRs y documentación

| Documento | Estado |
|-----------|--------|
| `docs/adr/004-elm327-emulador-docker.md` | Aprobado (parcialmente desactualizado) |
| `docs/adr/005-compliance-sae-j1979.md` | Aprobado (parcialmente desactualizado) |
| `docs/adr/008-isotp-transport-layer.md` | Propuesto (no implementado) |
| `docs/infrastructure/elm327-emulator.md` | Documentación de uso del emulador |
