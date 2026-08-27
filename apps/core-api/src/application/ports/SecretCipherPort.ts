/**
 * Contrato para cifrar secretos que la aplicacion necesita **recuperar en claro**,
 * a diferencia de las contrasenas, que solo se comparan y por eso se hashean.
 *
 * El caso que lo motiva es el secreto TOTP: no es un hash, es la llave — quien lo
 * lea genera codigos validos indefinidamente. La clave de cifrado vive fuera de la
 * base de datos, de modo que obtener el fichero `.db` no baste.
 */
export interface SecretCipherPort {
  /** Cifra un texto y devuelve una representacion almacenable en una columna de texto. */
  encrypt(plaintext: string): string

  /**
   * Descifra un valor producido por {@link SecretCipherPort.encrypt}.
   *
   * @throws Si el valor fue manipulado, esta corrupto o no corresponde a esta clave.
   *   Nunca devuelve un texto distinto del original en silencio.
   */
  decrypt(ciphertext: string): string
}
