import type { TwoFactorChallengeRecord } from '@/application/dto/auth/TwoFactorChallengeRecord.js'

/**
 * Contrato para los retos de segundo factor: el vale de un solo uso que se entrega
 * cuando la contrasena es correcta y que se canjea con el codigo.
 *
 * Se guarda **hasheado**, igual que los tokens de reseteo de contrasena: si la base
 * se filtra, lo que hay dentro no sirve para canjear nada.
 */
export interface TwoFactorChallengeRepository {
  /**
   * Guarda el hash de un reto con su caducidad y con la eleccion de sesion
   * recordada que hizo el usuario al dar su contrasena.
   */
  save(userId: number, tokenHash: string, expiresAt: string, rememberMe: boolean): Promise<void>

  /** Busca un reto por el hash de su token. */
  findByTokenHash(tokenHash: string): Promise<TwoFactorChallengeRecord | null>

  /** Marca un reto como canjeado, para que no valga una segunda vez. */
  markUsed(tokenHash: string): Promise<void>

  /** Invalida los retos vivos de un usuario (p. ej. al iniciar sesion de nuevo). */
  invalidateAllForUser(userId: number): Promise<void>
}
