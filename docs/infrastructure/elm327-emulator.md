# ELM327 Emulator (Docker)

> Emulador del adaptador OBD-II ELM327 con soporte multi-ECU y protocolo CAN 11-bit.
> Escenario activo: Audi A3 2.0 TDI (~25 PIDs SAE J1979 + 16 DIDs VAG Mode 22).
> Referencia: [ELM327-emulator v3.0.5](https://github.com/Ircama/ELM327-emulator)

## Setup

```bash
# Construir y arrancar
docker compose up -d elm327

# Ver estado
docker compose ps

# Ver logs
docker compose logs elm327

# Parar
docker compose down elm327
```

El emulador escucha en `localhost:35000`.

### Sin Docker (entornos sin daemon)

`ELM327-emulator` es un paquete pip: el contenedor solo lo envuelve. En un
entorno sin daemon de Docker (CI, contenedores remotos) se puede levantar
directamente, que es como se valido el stack completo el 13/08:

```bash
python3 -m venv /tmp/elmvenv
/tmp/elmvenv/bin/pip install --upgrade pip "setuptools<67" wheel
/tmp/elmvenv/bin/pip install --no-build-isolation ELM327-emulator

# Un proceso por escenario. `tail -f /dev/null` mantiene stdin abierto:
# sin el, el emulador termina al arrancar (misma razon que el CMD del Dockerfile).
cd docker/elm327
tail -f /dev/null | /tmp/elmvenv/bin/python run_audi.py      # :35000
tail -f /dev/null | /tmp/elmvenv/bin/python run_kawasaki.py  # :35001
tail -f /dev/null | /tmp/elmvenv/bin/python run_toyota.py    # :35002
```

Los defaults de `.env.example` ya apuntan a `localhost:35000-35002`, asi que
`OBD_MODE=docker` funciona sin cambios.

**Acepta una sola conexion TCP a la vez.** Si el backend esta levantado, otra
sonda contra el mismo puerto se queda colgada — no es un fallo del emulador.

**Requisito no obvio**: `apps/core-api/data/` debe existir o el backend aborta
al arrancar (`Cannot open database because the directory does not exist`). El
directorio esta gitignored, asi que en un clon limpio hay que crearlo.

## Probar conexión

### PowerShell (rápido)

```powershell
$c = [System.Net.Sockets.TcpClient]::new("localhost", 35000)
$s = $c.GetStream()
[Text.Encoding]::ASCII.GetBytes("01 0C`r") | % { $s.Write($_, 0, $_.Length) }
Start-Sleep -Milliseconds 300
$r = New-Object byte[] 512; $a = $s.Read($r, 0, 512)
[Text.Encoding]::ASCII.GetString($r, 0, $a)
$s.Close(); $c.Close()
```

### Node.js (scripts del proyecto)

```bash
# Enviar un comando OBD
pnpm tsx scripts/send-obd.ts "01 0C"

# PIDs VAG Mode 22 específicos del TDI
pnpm tsx scripts/send-obd.ts "22 115C"   # Boost pressure
pnpm tsx scripts/send-obd.ts "22 F477"   # Fuel rail pressure
pnpm tsx scripts/send-obd.ts "22 1410"   # DPF soot mass

# Escanear todos los PIDs soportados
pnpm tsx scripts/scan-pids.ts
```

## Formato de respuesta

Sin headers (por defecto):
```
01 0C              ← echo del comando
41 0C 14 5F        ← respuesta: mode 41, PID 0C, datos 14 5F
>                  ← prompt
```

Con headers (`AT H1`):
```
7E8 04 41 0C 14 5F  ← ECU 7E8, 4 bytes, mode 41, PID 0C, datos
```

| Campo | Significado |
|---|---|
| `7E8` | ECU ID (respuesta a petición `7E0`) |
| `04` | Número de bytes de datos |
| `41` | Mode 0x01 + 0x40 = respuesta |
| `0C` | PID (RPM en este caso) |
| `14 5F` | Datos: (0x14*256 + 0x5F) / 4 = 1303.75 RPM |

## Escenarios disponibles

| Escenario | Descripción | Comando |
|---|---|---|
| `audi-a3-tdi` | Audi A3 2.0 TDI EA288 — ~25 PIDs SAE + 16 DIDs VAG Mode 22 | `-s audi-a3-tdi` |
| `car` | Toyota Auris Hybrid (~25 PIDs) | `-s car` |
| `default` | PIDs básicos OBD-II | `-s default` |
| `mt05` | ECU Delphi MT05 (motos/ATVs) | `-s mt05` |

El escenario por defecto se cambia en el `CMD` de `docker/elm327/Dockerfile`.
Actualmente arranca con `audi-a3-tdi` mediante el wrapper `run_audi.py`.

Para alternar entre escenarios en caliente, conectarse al contenedor:
```bash
docker compose exec elm327 bash
```
Y desde el prompt `CMD>` del emulador, usar `scenario <nombre>`.

## Arquitectura del escenario `audi-a3-tdi`

Los PIDs están definidos en `docker/elm327/scenarios/audi_a3_tdi.py`.
El fichero `docker/elm327/run_audi.py` inyecta el escenario en el diccionario
`ObdMessage` del emulador antes de arrancar, sin modificar el paquete
`ELM327-emulator` instalado.

### Mode 01 — SAE J1979 (diesel subset)

PIDs enfocados a motores diésel TDI (sin fuel trim 06/07 ni spark advance 0E,
que son específicos de gasolina): 03 (Fuel status), 04 (Engine load),
05 (Coolant temp), 0B (MAP/boost), 0C (RPM), 0D (Speed), 0F (Intake temp),
10 (MAF), 11 (Throttle), 1C (OBD standard), 1F (Run time), 2C (Commanded EGR),
2D (EGR error), 2F (Fuel level), 31 (Distance since DTC clear),
33 (Barometric pressure), 3C (Catalyst temp), 42 (Module voltage),
46 (Ambient temp), 49 (Accel pedal D), 4C (Throttle actuator),
4D-4E (Time MIL/DTC), 51 (Fuel type = diesel), 5C (Oil temp), 5E (Fuel rate).

### Mode 22 — VAG UDS ReadDataByIdentifier

DIDs documentados por la comunidad Ross-Tech/VCDS para el motor EA288 CR,
todos en ECU `7E0` → respuesta `7E8`:

| DID | Nombre | Bytes | Ralentí (valor típico) |
|-----|--------|-------|------------------------|
| `1130` | Engine speed | 2 | 800 RPM |
| `115C` | Boost pressure actual | 2 | 1020 mbar |
| `115E` | Boost pressure specified | 2 | 1000 mbar |
| `F430` | Coolant temperature | 1 | 90 degC |
| `F432` | Intake air temperature | 1 | 35 degC |
| `F477` | Fuel rail pressure actual | 2 | ~280 bar |
| `F47D` | Fuel rail pressure specified | 2 | ~275 bar |
| `1035` | EGR duty cycle actual | 1 | 28 % |
| `1250` | Engine torque | 2 | 38 Nm |
| `1132` | Injection quantity | 2 | 4.0 mg/stroke |
| `1184` | Intake air mass | 2 | 480 mg/stroke |
| `1410` | DPF soot mass (calculated) | 2 | 8.0 g |
| `140E` | DPF differential pressure | 2 | 12 mbar |
| `F449` | Accelerator pedal position | 1 | 0 % |
| `1462` | Battery voltage | 2 | 14.1 V |
| `F40D` | Vehicle speed | 1 | 0 km/h |

## PIDs soportados en `car`

PID 01 (Monitor status), 03 (Fuel system), 04 (Engine load), 05 (Coolant temp),
06-07 (Fuel trim), 0B (MAP), 0C (RPM), 0D (Speed), 0E (Timing), 0F (Intake temp),
10 (MAF), 11 (Throttle), 13 (O2 sensors), 15 (O2 Sensor 2), 1C (OBD standard),
1F (Run time), 21 (Distance MIL), 24 (O2 lambda), 2C (EGR), 2E (Evap purge),
30 (Warm-ups), 31 (Distance clear), 33 (Baro pressure), 34 (O2 current),
3C-3E (Catalyst temp), 40-41 (Supported PIDs / Monitor drive), 42 (Voltage),
43-44 (Load / Lambda), 45-46 (Throttle / Ambient temp), 4D-4F, 5A, 5C, 5E, 61-63, 67.

## Variables de entorno

```
ELM327_HOST=localhost   # Host del emulador
ELM327_PORT=35000       # Puerto TCP
```

Definidas en `.env` (raíz del proyecto).

## Descubrimiento de ECUs (functional addressing, 7DF)

**Funciona.** Verificado el 19/08 contra el emulador: `GET /api/ecu-info` del Audi
devuelve cinco ECUs y la pantalla de topologia las pinta.

| Respuesta | Peticion |
|---|---|
| `7E8` | `7E0` — Engine Control Module (la unica que estandariza ISO 15765-4) |
| `7E9` | `7E1` |
| `7EA` | `7E2` |
| `7EB` | `7E3` |
| `7ED` | `7E5` |

Cuatro de las cinco salen en la UI como `ECU 7E9`, tipo `UNKNOWN`: `ecuAddressCatalog`
solo estandariza `7E8` y el proyecto no inventa nombres.

### Como responde el emulador a los dos caminos

El emulador **si** filtra por el campo `Header` de cada entrada de `ObdMessage`
(`elm.py:2081`), y `cmd_set_header` arranca valiendo `7E0` (`elm.py:427`), asi que el
filtro esta siempre activo. Eso separa limpiamente los dos usos de `01 00`:

| Camino | Header activo | Entrada que casa |
|---|---|---|
| `getSupportedPids()` | `7E0`, el de por defecto | `ELM_PIDS_A` — una sola linea |
| `discoverEcus` | `7DF`, el broadcast | `ELM_PIDS_A_BROADCAST` — una linea por ECU |

Por eso el soporte multi-ECU se anadio como **entrada nueva** y `ELM_PIDS_A` no se toco:
las dos no pueden casar a la vez, y el orden de `Priority` es irrelevante.

La `Response` de la entrada de broadcast encadena un bloque `HD(addr) + SZ + DT` por ECU
— el patron del escenario `car` del propio emulador (`obd_message.py:783`) — y cada bloque
se emite en su propia linea, que es lo que necesita `parseCanHeaders`. No lleva `PA(...)`:
su cabecera de respuesta seria `7DF + 8 = 7E7`, fuera del rango ISO 15765-4.

> **Correccion a lo que decia esta pagina.** Hasta el 19/08 aqui se afirmaba que
> «`elm.py` NUNCA lee el campo `Header`» y que el descubrimiento de ECUs solo se podia
> demostrar con un coche real. Las dos cosas eran falsas.

### Lo que este barrido no hace

Encuentra solo las ECU de emisiones del rango legislado `7E8`-`7EF`, que es lo que acepta
`isObdResponseAddr` (`protocol.ts:250`). Una maquina de taller tipo Autel lista muchos mas
sistemas (ABS, airbag, confort) porque pregunta a la gateway y habla UDS con direcciones
de fabricante, fuera de ese rango. Eso exigiria tocar emulador **y** codigo.

## Troubleshooting

**El contenedor se reinicia constantemente**:
- Verificar que `tail -f /dev/null` está en el CMD del Dockerfile
- Sin stdin abierto, el emulador termina inmediatamente

**`NO DATA` en respuesta**:
- El PID no está definido en el diccionario del escenario actual
- Cambiar a escenario `default` o añadir el PID al diccionario

**`SEARCHING...` sin respuesta**:
- El emulador no encuentra el PID en su diccionario
- Probar con `AT SP 0` (protocolo automático)

## Arquitectura

```
┌──────────────────────┐     TCP :35000     ┌──────────────────────┐
│  Nuestro backend (TS) │ ◄───────────────► │  ELM327-emulator     │
│  scripts/send-obd.ts  │    AT commands     │  (Python, Docker)    │
│  hexParser.ts         │    OBD queries     │  escenario 'car'     │
└──────────────────────┘                    └──────────────────────┘
```
