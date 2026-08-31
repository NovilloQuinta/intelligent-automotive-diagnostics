import type { TokenPair } from '@/application/dto/auth/TokenPair.js'

/** Contrato para el servicio de autenticacion (JWT + bcrypt). */
export interface AuthServicePort {
  hashPassword(password: string): Promise<string>
  comparePassword(password: string, hash: string): Promise<boolean>
  /**
   * Emite el par de tokens. Con `rememberMe` el refresh token dura lo que dure
   * una sesion recordada y queda marcado como tal, para que la rotacion lo
   * conserve. La contrasena no interviene aqui: no se guarda en ninguna parte.
   */
  generateTokens(userId: number, rememberMe?: boolean): TokenPair
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
