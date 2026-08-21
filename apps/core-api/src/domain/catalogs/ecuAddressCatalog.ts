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

/** Offset ISO 15765-4 entre direccion de peticion y de respuesta (`request = response - 8`). */
const REQUEST_ADDRESS_OFFSET = 8

/** Ancho en digitos hex de una direccion CAN de 11 bits. */
const CAN_ADDRESS_WIDTH = 3

/** Ancho en digitos hex de una direccion CAN de 29 bits. */
const CAN_29_ADDRESS_WIDTH = 8

/** Prefijo ISO 15765-4 de una respuesta de 29 bits dirigida al equipo de diagnostico. */
const CAN_29_RESPONSE_PREFIX = '18DAF1'

/** Prefijo ISO 15765-4 de una peticion fisica de 29 bits desde el equipo de diagnostico. */
const CAN_29_REQUEST_PREFIX = '18DA'

/** Sufijo de la peticion de 29 bits: la direccion del equipo de diagnostico como origen. */
const CAN_29_TESTER_ADDRESS = 'F1'

/** Formato valido de direccion CAN de respuesta: 3 digitos hex (11 bits) u 8 (29 bits). */
const CAN_ADDRESS_REGEX = /^([0-9A-Fa-f]{3}|[0-9A-Fa-f]{8})$/

/** Nombre con el que ISO 15765-4 identifica al unico ECU que estandariza. */
const ECM_NAME = 'Engine Control Module'

/** Ancho del identificador CAN, que es lo que decide el direccionamiento de la norma. */
type CanAddressWidth = 'CAN_11' | 'CAN_29'

/**
 * Direccionamiento ISO 15765-4, que depende del ancho del identificador CAN y no
 * del bitrate: los protocolos 6 y 8 comparten el de 11 bits, y el 7 y el 9 el de
 * 29 bits.
 *
 * En 29 bits la respuesta **no** es la peticion mas 8 como en 11 bits: se
 * intercambian los dos ultimos bytes (`18DA10F1` pregunta, `18DAF110` contesta).
 */
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
  /** Numero de protocolo ELM327, ya sin el prefijo de negociacion automatica. */
  readonly number: string
  /** Etiqueta que se persiste en `EcuInfo.protocol`. */
  readonly label: string
  /** Direccion de broadcast funcional: a quien se pregunta para descubrir ECUs. */
  readonly functionalAddress: string
  /** Direccion fisica de peticion al ECU de motor. */
  readonly ecmRequestAddress: string
  /** Direccion desde la que responde el ECU de motor. */
  readonly ecmResponseAddress: string
}

/**
 * Los cuatro buses CAN de ISO 15765-4, indexados por su numero de protocolo ELM327.
 *
 * La tabla es dato puro: numero → ancho de identificador y bitrate. Lo demas lo
 * aporta {@link ISO_15765_4_ADDRESSING}.
 *
 * Deliberadamente fuera: los protocolos 1-5 (J1850, ISO 9141-2, KWP2000) y el A
 * (J1939). No es que no se puedan leer —las lecturas normales funcionan en todos—,
 * es que el descubrimiento por broadcast funcional no tiene equivalente fuera de CAN.
 */
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

/**
 * Resuelve el bus CAN correspondiente a un numero de protocolo ELM327.
 *
 * Vive en el dominio porque la tabla es la norma: que el protocolo 6 sea CAN de
 * 11 bits a 500 kbps y que su broadcast funcional sea `7DF` lo fija ISO 15765-4,
 * no el adaptador. Quien traduce la respuesta concreta de `AT DPN` a un numero es
 * infraestructura.
 *
 * @param number - Numero de protocolo, sin el prefijo `A` de negociacion automatica.
 * @returns El bus si el numero identifica uno de los cuatro CAN; `null` en cualquier
 *   otro caso, incluido un protocolo anterior a CAN. **Nunca supone un bus por defecto.**
 */
export function resolveCanBusByNumber(number: string): CanBusDescriptor | null {
  return CAN_BUSES[number.trim().toUpperCase()] ?? null
}

/**
 * Catalogo ISO 15765-4 de direcciones CAN estandarizadas, en los dos anchos.
 *
 * Solo el ECM esta estandarizado por la norma, y sus direcciones se derivan de
 * {@link ISO_15765_4_ADDRESSING} para que la pareja peticion/respuesta este escrita
 * una sola vez. Cualquier otra direccion fisica la asigna cada fabricante, por lo
 * que se devuelve como `UNKNOWN` y su `requestAddr` se deriva aritmeticamente.
 * Nunca se inventa un nombre ni un tipo.
 */
const STANDARD_ECU_ADDRESSES: Readonly<Record<string, EcuAddressResolution>> = Object.fromEntries(
  Object.values(ISO_15765_4_ADDRESSING).map((addressing) => [
    addressing.ecmResponseAddress,
    { type: ECU_TYPE_ECM, name: ECM_NAME, requestAddr: addressing.ecmRequestAddress },
  ]),
)

/**
 * Deriva la direccion de peticion ISO 15765-4 desde la de respuesta.
 *
 * Los dos anchos usan reglas distintas y no intercambiables: en 11 bits la
 * peticion es la respuesta menos 8 (`7E8` → `7E0`); en 29 bits el destinatario y
 * el origen intercambian sitio (`18DAF110` → `18DA10F1`), porque la direccion ya
 * lleva dentro a quien va dirigida.
 */
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

/** Limite inferior del rango ISO 15765-4 de respuestas OBD en 11 bits (`0x7E8`). */
const OBD_RESPONSE_ADDR_MIN = 0x7e8

/** Limite superior del rango ISO 15765-4 de respuestas OBD en 11 bits (`0x7EF`). */
const OBD_RESPONSE_ADDR_MAX = 0x7ef

/**
 * Indica si un token tiene **forma** de direccion CAN: 3 digitos hex (11 bits) u 8 (29).
 *
 * Distinto de {@link isEcuResponseAddress}, que ademas exige que sea una respuesta
 * de diagnostico. La diferencia importa al parsear una traza: `18DB33F1` tiene forma
 * de direccion pero es una peticion, y la linea entera se descarta; `43` no tiene
 * forma de direccion, asi que la linea viene sin header y sus datos si valen.
 *
 * @param token - Primer token de una linea de respuesta.
 * @returns `true` si podria ser una direccion CAN, valida o no.
 */
export function looksLikeCanAddress(token: string): boolean {
  return CAN_ADDRESS_REGEX.test(token.trim())
}

/**
 * Indica si una direccion CAN es una respuesta de diagnostico OBD-II.
 *
 * Vive aqui, junto al catalogo, porque es la misma norma —ISO 15765-4— que decide
 * como se derivan las direcciones: tenerlo en dos sitios era pedir que se
 * desincronizaran. El adaptador ELM327 lo consume para filtrar los headers.
 *
 * El criterio cambia con el ancho, y no por capricho: en 11 bits la norma reserva
 * una ventana estrecha (`7E8-7EF`) y basta el rango; en 29 bits la ECU es un byte
 * cualquiera, asi que lo que se comprueba es que la trama vaya dirigida al equipo
 * de diagnostico (`18DAF1xx`). Una peticion —`18DB33F1` funcional o `18DA10F1`
 * fisica— no lo cumple.
 *
 * @param header - Direccion CAN cruda, en cualquier caja.
 * @returns `true` si es una respuesta de diagnostico valida.
 */
export function isEcuResponseAddress(header: string): boolean {
  const normalized = header.trim().toUpperCase()
  if (!CAN_ADDRESS_REGEX.test(normalized)) return false
  if (normalized.length === CAN_29_ADDRESS_WIDTH) {
    return normalized.startsWith(CAN_29_RESPONSE_PREFIX)
  }
  const addr = parseInt(normalized, 16)
  return addr >= OBD_RESPONSE_ADDR_MIN && addr <= OBD_RESPONSE_ADDR_MAX
}

/**
 * Resuelve una direccion CAN de respuesta a su tipo/nombre/direccion de peticion.
 *
 * @param responseAddr - Direccion CAN de respuesta: 3 digitos hex en 11 bits
 *   (`'7E8'`) u 8 en 29 bits (`'18DAF110'`).
 * @returns La entrada estandar si existe (el ECM en cualquiera de los dos anchos);
 *   en caso contrario, una resolucion `UNKNOWN` con `requestAddr` derivado.
 * @throws {EcuAddressError} Si `responseAddr` no tiene uno de los dos anchos validos.
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
    type: ECU_TYPE_UNKNOWN,
    name: `ECU ${normalized}`,
    requestAddr: deriveRequestAddress(normalized),
  }
}
