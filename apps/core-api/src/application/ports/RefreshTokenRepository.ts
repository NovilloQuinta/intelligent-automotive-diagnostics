import type { RefreshTokenRecord } from '@/application/dto/auth/RefreshTokenRecord.js'

/** Contrato para persistir y consultar refresh tokens. */
export interface RefreshTokenRepository {
  saveRefreshToken(userId: number, tokenHash: string, expiresAt: string): Promise<void>
  findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>
  revokeRefreshToken(tokenHash: string): Promise<void>
  /** Revoca todos los refresh tokens activos de un usuario (fuerza reautenticacion en todos los dispositivos). */
  revokeAllForUser(userId: number): Promise<void>
}
