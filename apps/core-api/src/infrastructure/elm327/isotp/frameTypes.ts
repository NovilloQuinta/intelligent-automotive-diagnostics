/** Tipo de trama CAN segun el nibble alto del PCI byte (ISO 15765-2). */
export enum FrameType {
  /** Single Frame — PCI 0x0n, n = payload length (1-7). */
  SINGLE = 0,
  /** First Frame — PCI 0x1n, n = upper nibble of 12-bit total length. */
  FIRST = 1,
  /** Consecutive Frame — PCI 0x2n, n = sequence number (0-15). */
  CONSECUTIVE = 2,
  /** Flow Control — PCI 0x3n, n = flow status (0=CTS, 1=WT, 2=Overflow). */
  FLOW_CONTROL = 3,
}

/** Trama CAN con 8 bytes de datos que incluyen el PCI byte en la primera posicion. */
export interface CanFrame {
  /** 8 bytes: [PCI, payload...]. */
  readonly data: readonly number[]
}

/** Informacion decodificada del PCI byte de una trama CAN ISO-TP. */
export interface IsotpFrameInfo {
  /** Tipo de trama (SINGLE, FIRST, CONSECUTIVE, FLOW_CONTROL). */
  type: FrameType
  /** Para SF: longitud del payload (1-7). Para FF: se extrae de los bytes 0-1 del frame. */
  dataLength?: number
  /** Para CF: numero de secuencia (0-15). */
  sequenceNumber?: number
  /** Para FC: estado de flujo (0=CTS, 1=WT, 2=Overflow). */
  flowStatus?: number
}

/** Error lanzado cuando un PCI byte es invalido (tipo desconocido) o una trama esta mal formada. */
export class IsotpFrameError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IsotpFrameError'
  }
}

/** Error lanzado cuando hay un gap en la secuencia de Consecutive Frames. */
export class IsotpSequenceError extends Error {
  /** Numero de secuencia esperado. */
  readonly expected: number
  /** Numero de secuencia recibido. */
  readonly received: number

  constructor(expected: number, received: number) {
    super(`Sequence gap: expected ${expected}, received ${received}`)
    this.name = 'IsotpSequenceError'
    this.expected = expected
    this.received = received
  }
}

/** Error lanzado cuando el payload total declarado en el First Frame excede 4095 bytes. */
export class IsotpOverflowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IsotpOverflowError'
  }
}

/** Error lanzado cuando el payload recibido es menor que la longitud declarada en el First Frame. */
export class IsotpTruncatedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IsotpTruncatedError'
  }
}

const PCI_TYPE_MASK = 0xf0
const PCI_PAYLOAD_MASK = 0x0f

/** Decodifica el PCI byte de una trama CAN ISO-TP usando operaciones bitwise.
 * @param byte — el primer byte de datos del frame CAN (PCI byte).
 * @returns Informacion decodificada con tipo de trama y metadatos especificos.
 * @throws IsotpFrameError — si el PCI byte no corresponde a ningun tipo de trama valido.
 *
 * @example
 * parsePci(0x03) // → { type: FrameType.SINGLE, dataLength: 3 }
 * parsePci(0x10) // → { type: FrameType.FIRST }
 * parsePci(0x21) // → { type: FrameType.CONSECUTIVE, sequenceNumber: 1 }
 * parsePci(0x30) // → { type: FrameType.FLOW_CONTROL, flowStatus: 0 } */
export function parsePci(byte: number): IsotpFrameInfo {
  const typeNibble = byte & PCI_TYPE_MASK
  const payloadNibble = byte & PCI_PAYLOAD_MASK

  switch (typeNibble) {
    case 0x00:
      if (payloadNibble === 0) {
        throw new IsotpFrameError(
          `Invalid PCI byte: 0x${byte.toString(16).padStart(2, '0')} (SF dataLength=0)`,
        )
      }
      return { type: FrameType.SINGLE, dataLength: payloadNibble }
    case 0x10:
      return { type: FrameType.FIRST }
    case 0x20:
      return { type: FrameType.CONSECUTIVE, sequenceNumber: payloadNibble }
    case 0x30:
      return { type: FrameType.FLOW_CONTROL, flowStatus: payloadNibble }
    default:
      throw new IsotpFrameError(
        `Invalid PCI byte: 0x${byte.toString(16).padStart(2, '0')} (type nibble 0x${(typeNibble >> 4).toString(16)})`,
      )
  }
}

/** Construye el PCI byte a partir de la informacion de trama decodificada.
 * @param info — informacion de trama con tipo y metadatos.
 * @returns El PCI byte como numero (0x00-0x3F).
 * @throws IsotpFrameError — si el tipo de trama es desconocido.
 *
 * @example
 * buildPci({ type: FrameType.SINGLE, dataLength: 3 }) // → 0x03
 * buildPci({ type: FrameType.FIRST }) // → 0x10
 * buildPci({ type: FrameType.CONSECUTIVE, sequenceNumber: 5 }) // → 0x25
 * buildPci({ type: FrameType.FLOW_CONTROL, flowStatus: 0 }) // → 0x30 */
export function buildPci(info: IsotpFrameInfo): number {
  switch (info.type) {
    case FrameType.SINGLE:
      return info.dataLength ?? 0
    case FrameType.FIRST:
      return 0x10 | (((info.dataLength ?? 0) >> 8) & 0x0f)
    case FrameType.CONSECUTIVE:
      return 0x20 | ((info.sequenceNumber ?? 0) & 0x0f)
    case FrameType.FLOW_CONTROL:
      return 0x30 | ((info.flowStatus ?? 0) & 0x0f)
    // unreachable: TypeScript enforces exhaustive enum switch
    /* v8 ignore next 3 */
    default:
      throw new IsotpFrameError(`Unknown frame type: ${info.type}`)
  }
}
