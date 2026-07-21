# ADR 006: Cumplimiento normativo SAE J1979 / ISO 15031 / ISO 3779

**Estado:** Aprobado
**Fecha:** 2026-07-18
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
| **01** | `0x01` | Current data (PIDs en vivo) | Sí | `readPid(mode, pid)` + `getSupportedPids()` |
| **02** | `0x02` | Freeze frame data | Sí | `getFreezeFrame(dtc?)` |
| **03** | `0x03` | Stored DTCs | Sí | `readDtcCodes()` |
| **04** | `0x04` | Clear DTCs | Sí (no-op en simulación) | `clearDtcCodes()` |
| **09** | `0x09` | Vehicle information (VIN) | Sí | `readVin()` + `vinDecoder` |

### Services SAE J1979 NO implementados (justificación)

| Service | Hex | Razón para no implementar |
|---|---|---|
| **05** | `0x05` | Test results O2 sensor (non-CAN). Específico de emisiones pre-CAN. Fuera del scope del TFM. |
| **06** | `0x06` | Test results other components. Complejo, específico de emisiones. |
| **07** | `0x07` | Pending DTCs. Útil pero no crítico para la demo del TFM. Posible extensión futura. |
| **08** | `0x08` | Control operations (actuadores). Fuera del scope de diagnóstico pasivo. |
| **0A** | `0x0A` | Permanent DTCs. Poco frecuente en diagnóstico cotidiano. |

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

- Los services no implementados (05-08, 0A) se documentan como gaps deliberados
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
