/**
 * Contrato para el segundo factor basado en tiempo (TOTP, RFC 6238).
 *
 * Las reglas del producto —digitos, periodo, ventana de tolerancia— viven en
 * `domain/twoFactor.ts`, no aqui: cambiar de libreria no debe poder cambiar en
 * silencio cuanto dura un codigo. Este puerto solo describe las operaciones que
 * necesitan criptografia o render, que es lo unico que justifica una dependencia.
 */
export interface TotpPort {
  /** Genera un secreto compartido nuevo, en Base32, listo para una app autenticadora. */
  generateSecret(): string

  /**
   * Comprueba un codigo contra el secreto, admitiendo la ventana de desfase del dominio.
   *
   * Devuelve `false` ante cualquier entrada invalida —codigo con formato raro, secreto
   * corrupto— en vez de lanzar: un fallo de verificacion es un resultado esperado del
   * login, no un error del servidor.
   */
  verify(secret: string, code: string): boolean

  /** Convierte una URI `otpauth://` en una imagen embebible como `data:` URI. */
  toQrDataUri(otpauthUri: string): Promise<string>
}
