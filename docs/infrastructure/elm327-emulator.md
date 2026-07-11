# ELM327 Emulator (Docker)

> Emulador del adaptador OBD-II ELM327 con soporte multi-ECU y protocolo CAN 11-bit.
> Escenario por defecto: Toyota Auris Hybrid (~25 PIDs SAE J1979).
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
| `car` | Toyota Auris Hybrid (~25 PIDs) | Por defecto |
| `default` | PIDs básicos OBD-II | `-s default` |
| `mt05` | ECU Delphi MT05 (motos/ATVs) | `-s mt05` |

Para cambiar el escenario, editar `CMD` en `docker/elm327/Dockerfile` y reconstruir.

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
