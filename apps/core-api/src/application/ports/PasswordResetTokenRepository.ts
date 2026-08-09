import type { PasswordResetTokenRecord } from '@/application/dto/auth/PasswordResetTokenRecord.js'

/** Contrato para persistir y consultar tokens de reseteo de contraseña. */
export interface PasswordResetTokenRepository {
  /** Persiste un token nuevo (hasheado) con su fecha de expiracion. */
  save(userId: number, tokenHash: string, expiresAt: string): Promise<void>

  /** Busca un token por su hash. Devuelve null si no existe. */
  findByTokenHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>

  /** Marca un token como usado (single-use). */
  markUsed(tokenHash: string): Promise<void>

  /** Invalida (marca como usados) todos los tokens no usados de un usuario. */
  invalidateAllForUser(userId: number): Promise<void>
}
