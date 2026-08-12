/** Modo 01 — Datos actuales del vehiculo (SAE J1979). */
export const MODE_CURRENT_DATA = '01'

/** Modo 03 — Codigos de diagnostico de problemas (DTC). */
export const MODE_DTC = '03'

/** Modo 09 — Informacion del vehiculo (VIN). */
export const MODE_VIN = '09'

/** PID 00 — PIDs soportados (bitmap). */
export const PID_SUPPORTED = '00'

/** PID 02 — Numero de identificacion del vehiculo (VIN). */
export const PID_VIN = '02'

/** PID 04 — Carga calculada del motor. */
export const PID_ENGINE_LOAD = '04'

/** PID 05 — Temperatura del refrigerante del motor. */
export const PID_COOLANT_TEMP = '05'

/** PID 0C — Revoluciones del motor (RPM). */
export const PID_RPM = '0C'

/** PID 0D — Velocidad del vehiculo. */
export const PID_SPEED = '0D'

/** PID 0F — Temperatura del aire de admision. */
export const PID_INTAKE_TEMP = '0F'

/**
 * PIDs por defecto del dashboard de telemetria en vivo (Mode 01).
 *
 * Orden estable: RPM, refrigerante, velocidad y admision. El endpoint
 * `GET /api/live-data` los usa cuando el cliente no envia el query param `pids`.
 */
export const DEFAULT_LIVE_PIDS: readonly string[] = [
  PID_RPM,
  PID_COOLANT_TEMP,
  PID_SPEED,
  PID_INTAKE_TEMP,
]

/** PID 11 — Posicion del acelerador. */
export const PID_THROTTLE_POSITION = '11'

/** PID 42 — Voltaje del modulo de control. */
export const PID_CONTROL_MODULE_VOLTAGE = '42'

/** PID 06 — Ajuste de combustible a corto plazo (banco 1). */
export const PID_SHORT_TERM_FUEL_TRIM = '06'

/** PID 07 — Ajuste de combustible a largo plazo (banco 1). */
export const PID_LONG_TERM_FUEL_TRIM = '07'

/** PID 0B — Presion absoluta del colector de admision. */
export const PID_MANIFOLD_ABS_PRESSURE = '0B'

/** PID 0E — Avance de encendido. */
export const PID_TIMING_ADVANCE = '0E'

/** PID 10 — Caudal masico de aire. */
export const PID_MASS_AIR_FLOW = '10'

/** PID 2F — Nivel del deposito de combustible. */
export const PID_FUEL_TANK_LEVEL = '2F'

/** PID 31 — Distancia recorrida desde el borrado de codigos. */
export const PID_DISTANCE_SINCE_CLEARED = '31'

/** PID 46 — Temperatura del aire ambiente. */
export const PID_AMBIENT_AIR_TEMP = '46'

/** PID 5C — Temperatura del aceite del motor. */
export const PID_ENGINE_OIL_TEMP = '5C'

/** Modo 22 — Datos propietarios del fabricante (UDS ReadDataByIdentifier). */
export const MODE_PROPRIETARY = '22'

/** PID 0300 — Odometro almacenado en la TCU (Toyota). */
export const PID_ODOMETER_TCU = '0300'

/** PID 0400 — Odometro almacenado en el ECM (Toyota). */
export const PID_ODOMETER_ECM = '0400'
