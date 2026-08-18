/** Estado del contador de intentos fallidos tras registrar un fallo de login. */
export interface FailedLoginState {
  /** Numero de intentos fallidos acumulados ya persistidos. */
  readonly failedLoginAttempts: number

  /** Instante ISO-8601 hasta el que la cuenta queda bloqueada, o `null` si no lo esta. */
  readonly lockedUntil: string | null
}
