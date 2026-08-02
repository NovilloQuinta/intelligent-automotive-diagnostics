/** Registro de refresh token devuelto por el repositorio. */
export interface RefreshTokenRecord {
  readonly userId: number
  /** Fecha de expiracion en formato ISO-8601. */
  readonly expiresAt: string
  /** Fecha de revocacion en formato ISO-8601, o null si sigue activo. */
  readonly revokedAt: string | null
}

/** Contrato para persistir y consultar refresh tokens. */
export interface RefreshTokenRepositoryPort {
  saveRefreshToken(userId: number, tokenHash: string, expiresAt: string): Promise<void>
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>
  revokeRefreshToken(tokenHash: string): Promise<void>
}
