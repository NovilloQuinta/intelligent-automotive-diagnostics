/** Error lanzado cuando falla la validacion de un codigo DTC. */
export class DtcCodeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DtcCodeError'
  }
}

/** Formato SAE J2012: P/C/B/U + tipo 0-3 + 3 hex digits. */
const DTC_REGEX = /^[PBCU][0-3][0-9A-F]{3}$/

/** Value Object que representa un codigo de diagnostico DTC SAE J2012. */
export class DtcCode {
  readonly code: string
  readonly description: string

  constructor(params: { code: string; description?: string }) {
    const code = params.code.trim().toUpperCase()
    if (!DTC_REGEX.test(code)) {
      throw new DtcCodeError(`Invalid DTC format: "${params.code}". Must match SAE J2012 (e.g. P0301).`)
    }
    this.code = code
    this.description = params.description ?? ''
  }

  /** SAE J2012: decodifica un par de bytes del bus CAN a un codigo DTC (ej. 0x0301 → "P0301"). */
  static decodeFromBytes(byte1: number, byte2: number): string {
    const categories = ['P', 'C', 'B', 'U']
    const category = categories[(byte1 >> 6) & 0x03]
    const digit1 = (byte1 >> 4) & 0x03
    const digit2 = byte1 & 0x0f
    const digit3 = byte2 >> 4
    const digit4 = byte2 & 0x0f
    return `${category}${digit1}${digit2}${digit3}${digit4}`
  }

  toString(): string {
    return this.description ? `${this.code}: ${this.description}` : this.code
  }
}
