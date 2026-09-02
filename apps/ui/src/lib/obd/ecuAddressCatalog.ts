/**
 * Catalogo ISO 15765-4 de direcciones CAN, portado de
 * `apps/core-api/src/domain/catalogs/ecuAddressCatalog.ts` para el transporte
 * USB nativo (Android). Sin dependencias de Node: puerto verbatim.
 */

/** Tipo de la ECU estandarizada ISO 15765-4 (`7E0`/`7E8` = Engine Control Module). */
export const ECU_TYPE_ECM = 'ECM' as const

/** Tipo reservado para direcciones CAN fisicas no estandarizadas por ISO 15765-4. */
export const ECU_TYPE_UNKNOWN = 'UNKNOWN' as const

/** Resultado de resolver una direccion CAN de respuesta a su tipo/nombre/direccion de peticion. */
export interface EcuAddressResolution {
  readonly type: typeof ECU_TYPE_ECM | typeof ECU_TYPE_UNKNOWN
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

const REQUEST_ADDRESS_OFFSET = 8
const CAN_ADDRESS_WIDTH = 3
const CAN_29_ADDRESS_WIDTH = 8
const CAN_29_RESPONSE_PREFIX = '18DAF1'
const CAN_29_REQUEST_PREFIX = '18DA'
const CAN_29_TESTER_ADDRESS = 'F1'
const CAN_ADDRESS_REGEX = /^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{8})$/
const ECM_NAME = 'Engine Control Module'

type CanAddressWidth = 'CAN_11' | 'CAN_29'

const ISO_15765_4_ADDRESSING: Readonly<
  Record<
    CanAddressWidth,
    {
      readonly functionalAddress: string
      readonly ecmRequestAddress: string
      readonly ecmResponseAddress: string
    }
  >
> = {
  CAN_11: { functionalAddress: '7DF', ecmRequestAddress: '7E0', ecmResponseAddress: '7E8' },
  CAN_29: {
    functionalAddress: '18DB33F1',
    ecmRequestAddress: '18DA10F1',
    ecmResponseAddress: '18DAF110',
  },
}

/** Bus CAN de ISO 15765-4, con las direcciones que la norma le asigna. */
export interface CanBusDescriptor {
  readonly number: string
  readonly label: string
  readonly functionalAddress: string
  readonly ecmRequestAddress: string
  readonly ecmResponseAddress: string
}

const CAN_BUS_TABLE: ReadonlyArray<
  readonly [number: string, width: CanAddressWidth, kbps: string]
> = [
  ['6', 'CAN_11', '500'],
  ['7', 'CAN_29', '500'],
  ['8', 'CAN_11', '250'],
  ['9', 'CAN_29', '250'],
]

const CAN_BUSES: Readonly<Record<string, CanBusDescriptor>> = Object.fromEntries(
  CAN_BUS_TABLE.map(([number, width, kbps]) => [
    number,
    { number, label: `${width}_${kbps}`, ...ISO_15765_4_ADDRESSING[width] },
  ]),
)

/** Resuelve el bus CAN correspondiente a un numero de protocolo ELM327. */
export function resolveCanBusByNumber(number: string): CanBusDescriptor | null {
  return CAN_BUSES[number.trim().toUpperCase()] ?? null
}

const STANDARD_ECU_ADDRESSES: Readonly<Record<string, EcuAddressResolution>> = Object.fromEntries(
  Object.values(ISO_15765_4_ADDRESSING).map((addressing) => [
    addressing.ecmResponseAddress,
    { type: ECU_TYPE_ECM, name: ECM_NAME, requestAddr: addressing.ecmRequestAddress },
  ]),
)

function deriveRequestAddress(responseAddr: string): string {
  if (responseAddr.length === CAN_29_ADDRESS_WIDTH) {
    const ecu = responseAddr.slice(CAN_29_RESPONSE_PREFIX.length)
    return `${CAN_29_REQUEST_PREFIX}${ecu}${CAN_29_TESTER_ADDRESS}`
  }
  return (parseInt(responseAddr, 16) - REQUEST_ADDRESS_OFFSET)
    .toString(16)
    .toUpperCase()
    .padStart(CAN_ADDRESS_WIDTH, '0')
}

const OBD_RESPONSE_ADDR_MIN = 0x7e8
const OBD_RESPONSE_ADDR_MAX = 0x7ef

/** Indica si un token tiene forma de direccion CAN: 3 digitos hex (11 bits) u 8 (29). */
export function looksLikeCanAddress(token: string): boolean {
  return CAN_ADDRESS_REGEX.test(token.trim())
}

/** Indica si una direccion CAN es una respuesta de diagnostico OBD-II. */
export function isEcuResponseAddress(header: string): boolean {
  const normalized = header.trim().toUpperCase()
  if (!CAN_ADDRESS_REGEX.test(normalized)) return false
  if (normalized.length === CAN_29_ADDRESS_WIDTH) {
    return normalized.startsWith(CAN_29_RESPONSE_PREFIX)
  }
  const addr = parseInt(normalized, 16)
  return addr >= OBD_RESPONSE_ADDR_MIN && addr <= OBD_RESPONSE_ADDR_MAX
}

/** Resuelve una direccion CAN de respuesta a su tipo/nombre/direccion de peticion. */
export function resolveEcuAddress(responseAddr: string): EcuAddressResolution {
  const trimmed = responseAddr.trim()
  if (!CAN_ADDRESS_REGEX.test(trimmed)) {
    throw new EcuAddressError(`Invalid CAN response address: "${responseAddr}"`)
  }
  const normalized = trimmed.toUpperCase()
  const standard = STANDARD_ECU_ADDRESSES[normalized]
  if (standard) return standard
  return {
    type: ECU_TYPE_UNKNOWN,
    name: `ECU ${normalized}`,
    requestAddr: deriveRequestAddress(normalized),
  }
}
