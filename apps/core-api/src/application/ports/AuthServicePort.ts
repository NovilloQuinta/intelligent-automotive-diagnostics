import type { TokenPair } from '@/application/dto/TokenPair.js'

/** Contrato para el servicio de autenticacion (JWT + bcrypt). */
export interface AuthServicePort {
  hashPassword(password: string): Promise<string>
  comparePassword(password: string, hash: string): Promise<boolean>
  generateTokens(userId: number): TokenPair
  /** Verifica un access token JWT.
   * @returns userId del sujeto del token.
   * @throws {Error} Si el token es invalido o ha expirado.
   */
  verifyAccessToken(token: string): number
  /**
   * Refresca un access token usando un refresh token valido.
   * Revoca el refresh token usado y emite uno nuevo.
   * @throws {Error} Si el token no se encuentra, ha sido revocado o ha expirado.
   */
  refreshAccessToken(refreshToken: string): Promise<TokenPair>
}
