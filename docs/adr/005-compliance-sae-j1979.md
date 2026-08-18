# ADR 005: Cumplimiento normativo SAE J1979 / ISO 15031 / ISO 3779

**Estado:** Aprobado (revisado Fase 4)
**Fecha:** 2026-07-18 | **Revisado:** 2026-08-18
**Contexto:** Verificación de estándares internacionales de diagnóstico OBD-II

---

## Contexto

El proyecto implementa un sistema de diagnóstico automotriz que lee parámetros OBD-II (PIDs). Para que el sistema sea válido desde el punto de vista de ingeniería automotriz, debe cumplir con los estándares internacionales que rigen la comunicación OBD-II y la identificación vehicular.

Los estándares aplicables son:

| Estándar | Alcance |
|---|---|
| **SAE J1979** | Define los PIDs estándar (Mode 01-09), sus fórmulas de conversión, y la estructura de respuesta |
| **ISO 15031-5** | Equivalente internacional de SAE J1979 para el mercado europeo y global |
| **SAE J1979-DA** | Documento de soporte con la asignación detallada de PIDs (Digital Annex) |
| **ISO 3779** | Estructura y contenido del VIN (17 caracteres, sin I/O/Q, check digit) |
| **SAE J2190** | PIDs propietarios de fabricante (Mode 22 para Ford/GM) — referencia |

---

## Decisión

El proyecto adopta los siguientes estándares con cobertura parcial pero demostrable:

### Services SAE J1979 implementados

| Service | Hex | Descripción | Implementado | Método |
|---|---|---|---|---|
| **01** | `0x01` | Current data (PIDs en vivo) | Sí | `readPid(mode, pid)` + `getSupportedPids()` + `getVehicleStatus()` |
| **02** | `0x02` | Freeze frame data | Sí | `getFreezeFrame(dtc?)` |
| **03** | `0x03` | Stored DTCs | Sí | `readDtcCodes()` |
| **04** | `0x04` | Clear DTCs | Sí (única escritura del sistema) | `clearDtcCodes()` |
| **07** | `0x07` | Pending DTCs | Sí | `readPendingDtcCodes()` |
| **09** | `0x09` | Vehicle information (VIN) | Sí | `readVin()` + `vinDecoder` |
| **0A** | `0x0A` | Permanent DTCs | Sí | `readPermanentDtcCodes()` |

`03`, `07` y `0A` comparten implementación: `fetchDtcCodes(mode)` en `elm327Adapter.ts` está tipado
como `'03' | '07' | '0A'`, de modo que los tres tipos de DTC se leen con el mismo parser y solo
cambia el byte de modo.

### Services alcanzables sin método dedicado

Estos modos están en la allowlist de solo lectura (`READ_ONLY_OBD_MODES`, `domain/obdServiceMode.ts`)
y por tanto se pueden emitir con `readPid(mode, pid)`, pero no tienen método de conveniencia ni
parseo específico en el puerto:

| Service | Hex | Estado |
|---|---|---|
| **05** | `0x05` | Test results de sonda lambda (non-CAN). Permitido, sin parseo dedicado |
| **06** | `0x06` | Test results de monitores on-board. Permitido, sin parseo dedicado |
| **22** | `0x22` | UDS ReadDataByIdentifier — PIDs propietarios de fabricante (SAE J2190) |

### Services SAE J1979 excluidos (justificación)

| Service | Hex | Razón para excluir |
|---|---|---|
| **08** | `0x08` | Control de componente on-board (actuadores). Fuera del scope de diagnóstico pasivo y **bloqueado en el dominio**: no está en `READ_ONLY_OBD_MODES` |

Junto a `08` quedan fuera todos los servicios de control UDS (`2F` InputOutputControl, `31`
RoutineControl, `11` ECUReset, `2E` WriteDataByIdentifier). El motivo es de seguridad, no de
alcance: comparten espacio de nombres con los de lectura y solo se distinguen por el byte de modo,
así que transponer `mode` y `pid` bastaría para convertir una lectura en una orden al vehículo
(`2F` es "nivel de combustible" como PID y "controlar actuador" como modo). `fetchPidBytes` valida
contra la allowlist **antes** de tocar el socket y lanza `UnsafeObdModeError`; una invariante por
reflexión (`elm327AdapterInvariant.test.ts`) recorre el prototipo del adaptador y falla si un método
nuevo emite un servicio de control.

Mode `04` es la única escritura del sistema y solo es accesible por `clearDtcCodes()`; con
`OBD_READ_ONLY=true` también se bloquea, que es como se conecta el coche real.

### Fórmulas SAE J1979 adoptadas

El `PidParser` (algoritmo Shunting-yard) evalúa fórmulas siguiendo exactamente las ecuaciones definidas en SAE J1979 §8:

| PID | Nombre SAE J1979 | Fórmula | Unidad |
|---|---|---|---|
| `01 0C` | Engine RPM | `(A*256+B)/4` | rpm |
| `01 05` | Engine Coolant Temperature | `A-40` | °C |
| `01 0D` | Vehicle Speed | `A` | km/h |
| `01 0F` | Intake Air Temperature | `A-40` | °C |
| `01 04` | Calculated Engine Load | `A*100/255` | % |
| `01 06` | Short Term Fuel Trim | `A*100/128-100` | % |
| `01 07` | Long Term Fuel Trim | `A*100/128-100` | % |
| `01 0B` | Intake Manifold Absolute Pressure | `A` | kPa |
| `01 0E` | Timing Advance | `A/2-64` | ° |
| `01 10` | Mass Air Flow Rate | `(A*256+B)/100` | g/s |
| `01 11` | Throttle Position | `A*100/255` | % |
| `01 2F` | Fuel Tank Level Input | `A*100/255` | % |
| `01 31` | Distance Since DTC Cleared | `A*256+B` | km |
| `01 42` | Control Module Voltage | `(A*256+B)/1000` | V |
| `01 46` | Ambient Air Temperature | `A-40` | °C |
| `01 5C` | Engine Oil Temperature | `A-40` | °C |

### Validación VIN (ISO 3779)

La funcion `validateVin()` en `domain/vin.ts` implementa:

- Longitud exacta de 17 caracteres
- Caracteres prohibidos: I, O, Q
- Solo mayúsculas A-Z y dígitos 0-9
- Conversión automática de minúsculas a mayúsculas
- Check digit (posición 9) vía algoritmo de transliteración + pesos + módulo 11
- Decodificación WMI (posición 1-3) para país y región de origen

La validación se integra en `SqliteVehicleRepository.upsertVehicle()` y `findVehicleByVin()` antes de cualquier operación con la base de datos.

---

## Consecuencias

**Positivas:**

- Las fórmulas son verificables contra el estándar público SAE J1979
- El VIN se valida según ISO 3779 antes de persistir en BD
- La arquitectura permite añadir más services sin modificar el dominio
- El `PidParser` Shunting-yard soporta cualquier fórmula SAE J1979 sin hardcodear

**Negativas:**

- Los modos `05` y `06` se aceptan pero no se parsean: devuelven bytes crudos sin interpretar
- El único service excluido por completo es `08`, y lo es por seguridad, no por alcance
- Mode 22 (PIDs propietarios) no está estandarizado — cada fabricante define los suyos
- El check digit del VIN solo es obligatorio en Norteamérica y China; en Europa es opcional

---

## Referencias

- [SAE J1979 — E/E Diagnostic Test Modes](https://www.sae.org/standards/content/j1979_201702/)
- [ISO 15031-5:2015 — Road vehicles](https://www.iso.org/standard/66378.html)
- [ISO 3779:2009 — VIN content and structure](https://www.iso.org/standard/52200.html)
- [OBD-II PIDs — Wikipedia](https://en.wikipedia.org/wiki/OBD-II_PIDs)
- ADR-001: `001-arquitectura-del-sistema.md`
- ADR-003: `003-diagnostico-cognitivo-mcp.md`
