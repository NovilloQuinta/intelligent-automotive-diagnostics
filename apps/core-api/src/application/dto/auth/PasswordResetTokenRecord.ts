export interface PasswordResetTokenRecord {
  readonly id: number
  readonly userId: number
  readonly tokenHash: string
  /** Fecha de expiracion en formato ISO-8601. */
  readonly expiresAt: string
  /** Fecha de creacion en formato ISO-8601. */
  readonly createdAt: string
  /** Fecha de uso en formato ISO-8601, o null si el token sigue sin usarse. */
  readonly usedAt: string | null
}
