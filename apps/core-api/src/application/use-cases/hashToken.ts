import { createHash } from 'node:crypto'

const ALGORITHM_SHA256 = 'sha256'
const ENCODING_HEX = 'hex'

/** Calcula el hash SHA-256 de un token para almacenamiento seguro. */
export function hashToken(token: string): string {
  return createHash(ALGORITHM_SHA256).update(token).digest(ENCODING_HEX)
}
