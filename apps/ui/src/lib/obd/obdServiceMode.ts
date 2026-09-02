/**
 * Allowlist de modos OBD-II/UDS de solo lectura, portada de
 * `apps/core-api/src/domain/obdServiceMode.ts`. El cliente nativo solo emite
 * los modos que ya usa el resto del sistema (01, 02, 03, 07, 09, 0A, 22) mas el
 * 04 de borrado de DTC — la misma politica que el backend, para que un comando
 * mal formado no llegue nunca al bus real.
 */
export class UnsafeObdModeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeObdModeError'
  }
}

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

/** Indica si un modo OBD es de solo lectura y por tanto seguro de emitir al bus. */
export function isReadOnlyObdMode(mode: string): boolean {
  return READ_ONLY_OBD_MODES.has(mode.toUpperCase())
}

/**
 * Valida que un modo OBD sea de solo lectura antes de emitirlo al vehiculo.
 * @throws {UnsafeObdModeError} Si el modo no es de solo lectura.
 */
export function assertReadOnlyObdMode(mode: string): void {
  if (isReadOnlyObdMode(mode)) return
  throw new UnsafeObdModeError(
    `OBD mode "${mode}" is not a read-only service and was blocked before reaching the vehicle bus.`,
  )
}
