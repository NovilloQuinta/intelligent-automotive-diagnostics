/** Registro de refresh token devuelto por el store. */
export interface RefreshTokenRecord {
  readonly userId: number
  readonly expiresAt: string
  readonly revokedAt: string | null
}

/** Contrato para persistir y consultar refresh tokens. */
export interface RefreshTokenStorePort {
  saveRefreshToken(userId: number, tokenHash: string, expiresAt: string): Promise<void>
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>
  revokeRefreshToken(tokenHash: string): Promise<void>
}
