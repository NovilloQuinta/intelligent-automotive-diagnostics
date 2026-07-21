/** Contrato para el servicio de autenticacion (JWT + bcrypt). */
export interface AuthServicePort {
  hashPassword(password: string): Promise<string>
  comparePassword(password: string, hash: string): Promise<boolean>
  generateTokens(userId: number): {
    accessToken: string
    refreshToken: string
  }
  verifyAccessToken(token: string): number
  refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }>
}
