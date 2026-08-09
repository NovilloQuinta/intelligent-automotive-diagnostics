/** Resumen agregado de usuarios: totales por `userType` y por `role`. */
export interface UserStats {
  readonly byUserType: Readonly<Record<string, number>>
  readonly byRole: Readonly<Record<string, number>>
}
