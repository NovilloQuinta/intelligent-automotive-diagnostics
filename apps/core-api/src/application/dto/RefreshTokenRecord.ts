/** Registro de refresh token devuelto por el repositorio. */
export interface RefreshTokenRecord {
  readonly userId: number
  /** Fecha de expiracion en formato ISO-8601. */
  readonly expiresAt: string
  /** Fecha de revocacion en formato ISO-8601, o null si sigue activo. */
  readonly revokedAt: string | null
}
