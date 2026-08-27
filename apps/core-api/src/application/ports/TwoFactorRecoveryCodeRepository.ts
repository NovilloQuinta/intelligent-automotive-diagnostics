/**
 * Contrato para los codigos de recuperacion del segundo factor.
 *
 * Guarda solo hashes. El canje es **atomico** (`consume` decide y marca en la misma
 * operacion) para que dos peticiones simultaneas con el mismo codigo no puedan
 * gastarlo dos veces: separar "comprobar" de "marcar" abriria esa carrera.
 */
export interface TwoFactorRecoveryCodeRepository {
  /** Sustituye el lote del usuario por uno nuevo. Regenerar invalida el anterior. */
  replaceAllForUser(userId: number, codeHashes: readonly string[]): Promise<void>

  /**
   * Canjea un codigo si existe, es de este usuario y sigue sin usar.
   *
   * @returns `true` si lo ha canjeado; `false` si no existia o ya estaba gastado.
   */
  consume(userId: number, codeHash: string): Promise<boolean>

  /** Cuantos codigos le quedan sin usar. Para avisar al usuario cuando se agoten. */
  countUnused(userId: number): Promise<number>

  /** Borra todos los codigos del usuario, al desactivar el segundo factor. */
  deleteAllForUser(userId: number): Promise<void>
}
