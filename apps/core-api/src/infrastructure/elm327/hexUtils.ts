import { Elm327ParseError } from './errors.js'

/** Valida que un token hexadecimal tenga exactamente 1 o 2 dígitos [0-9A-F] case-insensitive. */
const HEX_TOKEN_RE = /^[0-9A-F]{1,2}$/i

/**
 * Parsea una secuencia de bytes hex separados por espacios ("0C 80" → [0x0C, 0x80]).
 *
 * @param hex - Cadena con bytes hexadecimales separados por espacios.
 * @returns Array de números (0-255) correspondientes a cada byte válido.
 * @throws {Elm327ParseError} Si algún token no es un byte hexadecimal válido (1 o 2 dígitos hex).
 */
export function parseHexBytes(hex: string): number[] {
  return hex
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      if (!HEX_TOKEN_RE.test(token)) {
        throw new Elm327ParseError(token)
      }
      return Number.parseInt(token, 16)
    })
}

/** Int big-endian de todos los bytes (fallback para PIDs sin fórmula conocida). */
export function bigEndian(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc * 256 + b, 0)
}
