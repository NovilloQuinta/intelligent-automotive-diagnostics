import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'

const ALGORITHM = 'aes-256-gcm'
const KEY_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

/** Marca de version del formato, para poder rotar el esquema sin adivinar. */
const FORMAT_PREFIX = 'v1'

/** Error al construir el cifrador con una clave que no sirve. */
export class InvalidCipherKeyError extends Error {
  constructor(detail: string) {
    super(`Invalid secret cipher key: ${detail}`)
    this.name = 'InvalidCipherKeyError'
  }
}

/** Error al descifrar: valor manipulado, corrupto o cifrado con otra clave. */
export class SecretDecryptionError extends Error {
  constructor() {
    super('Secret could not be decrypted')
    this.name = 'SecretDecryptionError'
  }
}

/** Decodifica y valida la clave, que llega en base64 desde la configuracion. */
function parseKey(base64Key: string): Buffer {
  if (!base64Key) throw new InvalidCipherKeyError('key is empty')

  const key = Buffer.from(base64Key, 'base64')
  if (key.byteLength !== KEY_BYTES) {
    throw new InvalidCipherKeyError(`expected ${KEY_BYTES} bytes, got ${key.byteLength}`)
  }
  // Base64 descarta en silencio los caracteres invalidos, asi que una cadena que no
  // lo es puede dar 32 bytes por casualidad. Se comprueba el viaje de vuelta.
  if (key.toString('base64').replace(/=+$/, '') !== base64Key.replace(/=+$/, '')) {
    throw new InvalidCipherKeyError('key is not valid base64')
  }
  return key
}

/** Separa el valor almacenado en sus tres partes, o lanza si no tiene el formato. */
function splitStoredParts(stored: string): [string, string, string] {
  const [prefix, iv, tag, data] = stored.split('.')
  if (prefix !== FORMAT_PREFIX) throw new SecretDecryptionError()
  if (!iv || !tag || !data) throw new SecretDecryptionError()
  return [iv, tag, data]
}

/** Decodifica una parte base64url exigiendo su longitud exacta. */
function decodeFixedLength(part: string, expectedBytes: number): Buffer {
  const decoded = Buffer.from(part, 'base64url')
  if (decoded.byteLength !== expectedBytes) throw new SecretDecryptionError()
  return decoded
}

/**
 * Cifrado simetrico autenticado con AES-256-GCM sobre `node:crypto`.
 *
 * Cada cifrado lleva su propio IV aleatorio, de modo que dos usuarios con el mismo
 * secreto no compartan fila: si no, la propia base delataria esa coincidencia. El
 * tag de autenticacion de GCM es lo que hace que manipular el valor almacenado
 * falle de forma explicita en vez de producir un secreto distinto en silencio.
 *
 * Formato almacenado: `v1.<iv>.<tag>.<ciphertext>`, las tres partes en base64url.
 */
export class AesGcmSecretCipher implements SecretCipherPort {
  private readonly key: Buffer

  constructor(base64Key: string) {
    this.key = parseKey(base64Key)
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv(ALGORITHM, this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const parts = [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString('base64url'))
    return [FORMAT_PREFIX, ...parts].join('.')
  }

  decrypt(stored: string): string {
    const [ivPart, tagPart, dataPart] = splitStoredParts(stored)
    const iv = decodeFixedLength(ivPart, IV_BYTES)
    const authTag = decodeFixedLength(tagPart, AUTH_TAG_BYTES)

    try {
      const decipher = createDecipheriv(ALGORITHM, this.key, iv)
      decipher.setAuthTag(authTag)
      const data = Buffer.from(dataPart, 'base64url')
      return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
    } catch {
      // `final()` lanza si el tag no cuadra. Se traduce a un error propio para no
      // filtrar detalles de la libreria en la capa de arriba.
      throw new SecretDecryptionError()
    }
  }
}
