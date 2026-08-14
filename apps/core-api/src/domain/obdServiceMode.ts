/**
 * Politica de seguridad sobre los servicios OBD-II/UDS que el sistema puede emitir al bus.
 *
 * El diagnostico de este proyecto es de solo lectura: interroga a la ECU, nunca la
 * manda actuar. Los servicios de control (`2F` InputOutputControl, `31` RoutineControl,
 * `11` ECUReset, `2E` WriteDataByIdentifier...) comparten espacio de nombres con los de
 * lectura y se distinguen unicamente por el byte de modo, asi que una transposicion de
 * `mode`/`pid` basta para convertir una lectura inocua en una orden al vehiculo:
 * `2F` es "nivel de combustible" como PID y "controlar actuador" como modo.
 *
 * Esta allowlist es la garantia de que eso no puede ocurrir. Vive en el dominio porque
 * es conocimiento OBD, no un detalle del adaptador: cualquier transporte futuro
 * (Bluetooth, J2534) debe respetarla igual.
 */

/** Error lanzado cuando se intenta emitir un modo OBD que no es de solo lectura. */
export class UnsafeObdModeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeObdModeError'
  }
}

/**
 * Servicios OBD-II/UDS de solo lectura permitidos.
 *
 * - `01` current data, `02` freeze frame, `05` resultados de test de sonda lambda,
 *   `06` resultados de monitores on-board, `09` vehicle information (VIN).
 * - `03` / `07` / `0A` lectura de DTC almacenados, pendientes y permanentes.
 * - `22` UDS ReadDataByIdentifier (PIDs propietarios de fabricante).
 *
 * Deliberadamente fuera: `04` (borrado de DTC, unico modo de escritura del sistema y
 * accesible solo via {@link ObdRepository.clearDtcCodes}) y `08` (control de componente
 * on-board), ademas de todos los servicios de control UDS.
 */
export const READ_ONLY_OBD_MODES: ReadonlySet<string> = new Set([
  '01',
  '02',
  '03',
  '05',
  '06',
  '07',
  '09',
  '0A',
  '22',
])

/** Formato de un byte de modo OBD valido: exactamente 2 digitos hexadecimales. */
const MODE_REGEX = /^[0-9A-F]{2}$/

/**
 * Indica si un modo OBD es de solo lectura y por tanto seguro de emitir al bus.
 *
 * @param mode - Byte de modo en hexadecimal, case-insensitive (ej. `'01'`, `'0a'`).
 * @returns `true` si el modo esta en {@link READ_ONLY_OBD_MODES}.
 */
export function isReadOnlyObdMode(mode: string): boolean {
  return READ_ONLY_OBD_MODES.has(mode.toUpperCase())
}

/**
 * Valida que un modo OBD sea de solo lectura antes de emitirlo al vehiculo.
 *
 * Cuando el modo rechazado tiene forma de PID valido, el mensaje sugiere la lectura
 * equivalente en Mode 01: el fallo mas probable no es un modo exotico, sino haber
 * intercambiado `mode` y `pid`.
 *
 * @param mode - Byte de modo en hexadecimal, case-insensitive.
 * @throws {UnsafeObdModeError} Si el modo no es de solo lectura.
 */
export function assertReadOnlyObdMode(mode: string): void {
  if (isReadOnlyObdMode(mode)) return
  const normalized = mode.toUpperCase()
  const allowed = [...READ_ONLY_OBD_MODES].join(', ')
  const hint = MODE_REGEX.test(normalized)
    ? ` If you meant to read PID ${normalized}, use mode "01".`
    : ''
  throw new UnsafeObdModeError(
    `OBD mode "${mode}" is not a read-only service and was blocked before reaching the vehicle bus. ` +
      `Allowed modes: ${allowed}.${hint}`,
  )
}
