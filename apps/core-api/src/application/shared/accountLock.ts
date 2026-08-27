/**
 * Indica si `lockedUntil` marca un bloqueo todavia vigente.
 *
 * Compartido entre el login y la verificacion del segundo factor: los dos pasos
 * miran el mismo bloqueo, y tener dos copias de esta comprobacion es la forma
 * clasica de que una se quede atras cuando cambie la regla.
 */
export function isAccountLocked(lockedUntil: string | null | undefined): lockedUntil is string {
  return !!lockedUntil && new Date(lockedUntil) > new Date()
}
