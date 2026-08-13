/** Resultado de resolver una direccion CAN de respuesta a su tipo/nombre/direccion de peticion. */
export interface EcuAddressResolution {
  readonly type: 'ECM' | 'UNKNOWN'
  readonly name: string
  readonly requestAddr: string
}

/** Error lanzado cuando una direccion CAN de respuesta no es valida. */
export class EcuAddressError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EcuAddressError'
  }
}

/** Offset ISO 15765-4 entre direccion de peticion y de respuesta (`request = response - 8`). */
const REQUEST_ADDRESS_OFFSET = 8

/** Ancho en digitos hex de una direccion CAN normalizada. */
const CAN_ADDRESS_WIDTH = 3

/** Formato valido de direccion CAN de respuesta: exactamente 3 digitos hexadecimales. */
const CAN_ADDRESS_REGEX = /^[0-9A-Fa-f]{3}$/

/**
 * Catalogo ISO 15765-4 de direcciones CAN estandarizadas.
 *
 * Solo `7E8` (respuesta) / `7E0` (peticion) = ECM esta estandarizada por la
 * norma. Cualquier otra direccion fisica la asigna cada fabricante, por lo que
 * se devuelve como `UNKNOWN` y su `requestAddr` se deriva aritmeticamente
 * (`response - 8`). Nunca se inventa un nombre ni un tipo.
 */
const STANDARD_ECU_ADDRESSES: Readonly<Record<string, EcuAddressResolution>> = {
  '7E8': { type: 'ECM', name: 'Engine Control Module', requestAddr: '7E0' },
}

/** Deriva la direccion de peticion ISO 15765-4 (`request = response - 8`). */
function deriveRequestAddress(responseAddr: string): string {
  return (parseInt(responseAddr, 16) - REQUEST_ADDRESS_OFFSET)
    .toString(16)
    .toUpperCase()
    .padStart(CAN_ADDRESS_WIDTH, '0')
}

/**
 * Resuelve una direccion CAN de respuesta a su tipo/nombre/direccion de peticion.
 *
 * @param responseAddr - Direccion CAN de respuesta (3 digitos hex, ej. '7E8').
 * @returns La entrada estandar si existe (`7E8` → ECM); en caso contrario, una
 *   resolucion `UNKNOWN` con `requestAddr` derivado como `response - 8`.
 * @throws {EcuAddressError} Si `responseAddr` no son exactamente 3 digitos hex.
 */
export function resolveEcuAddress(responseAddr: string): EcuAddressResolution {
  const trimmed = responseAddr.trim()
  if (!CAN_ADDRESS_REGEX.test(trimmed)) {
    throw new EcuAddressError(`Invalid CAN response address: "${responseAddr}"`)
  }
  const normalized = trimmed.toUpperCase()
  const standard = STANDARD_ECU_ADDRESSES[normalized]
  if (standard) return standard
  return {
    type: 'UNKNOWN',
    name: `ECU ${normalized}`,
    requestAddr: deriveRequestAddress(normalized),
  }
}
