/** Registro de reto de segundo factor devuelto por el repositorio. */
export interface TwoFactorChallengeRecord {
  readonly id: number
  readonly userId: number
  readonly tokenHash: string
  /** Instante de caducidad en formato ISO-8601. */
  readonly expiresAt: string
  /** Instante de creacion en formato ISO-8601. */
  readonly createdAt: string
  /** Instante de canje en ISO-8601, o `null` si el reto sigue sin usarse. */
  readonly usedAt: string | null
}
