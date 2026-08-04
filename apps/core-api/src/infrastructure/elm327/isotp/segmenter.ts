import {
  type CanFrame,
  buildPci,
  FrameType,
  IsotpOverflowError,
  IsotpFrameError,
} from './frameTypes.js'

const ISO_TP_MAX_LENGTH = 4095
const DEFAULT_MTU = 8
const FF_OVERHEAD = 2
const CF_OVERHEAD = 1
const SF_OVERHEAD = 1

/** Calcula el numero de tramas CAN necesarias para transportar un payload.
 * @param totalLength — longitud total del payload en bytes.
 * @param mtu — Maximum Transmission Unit en bytes.
 * @returns Numero de tramas (1 SF o 1 FF + N CFs). */
export function computeFrameCount(totalLength: number, mtu: number): number {
  const sfPayloadCapacity = mtu - SF_OVERHEAD
  if (totalLength <= sfPayloadCapacity) return 1
  const ffPayloadCapacity = mtu - FF_OVERHEAD
  const cfPayloadCapacity = mtu - CF_OVERHEAD
  const remaining = totalLength - ffPayloadCapacity
  return 1 + Math.ceil(remaining / cfPayloadCapacity)
}

function buildSingleFrame(payload: number[]): CanFrame {
  return {
    data: [buildPci({ type: FrameType.SINGLE, dataLength: payload.length }), ...payload],
  }
}

function buildFirstFrame(payload: number[], totalLen: number, ffPayloadCapacity: number): CanFrame {
  const ffPciByte = buildPci({ type: FrameType.FIRST, dataLength: totalLen })
  const lenByte = totalLen & 0xff
  return { data: [ffPciByte, lenByte, ...payload.slice(0, ffPayloadCapacity)] }
}

function buildConsecutiveFrames(
  payload: number[],
  startOffset: number,
  totalLen: number,
  cfPayloadCapacity: number,
): CanFrame[] {
  const frames: CanFrame[] = []
  let offset = startOffset
  let seqNum = 1

  while (offset < totalLen) {
    const chunkSize = Math.min(cfPayloadCapacity, totalLen - offset)
    const cfPciByte = buildPci({ type: FrameType.CONSECUTIVE, sequenceNumber: seqNum })
    frames.push({ data: [cfPciByte, ...payload.slice(offset, offset + chunkSize)] })
    offset += chunkSize
    seqNum = (seqNum + 1) & 0x0f
  }

  return frames
}

/** Segmenta un payload en tramas CAN ISO-TP (Single Frame o First Frame + Consecutive Frames).
 * @param payload — bytes a segmentar.
 * @param mtu — Maximum Transmission Unit. Por defecto 8 (CAN clasico). Configurable para CAN FD (64).
 * @returns Array de {@link CanFrame} con los bytes de control (PCI) incluidos.
 * @throws IsotpOverflowError — si el payload excede 4095 bytes.
 * @throws IsotpFrameError — si el payload esta vacio.
 */
export function segmentPayload(payload: number[], mtu: number = DEFAULT_MTU): CanFrame[] {
  if (payload.length === 0) {
    throw new IsotpFrameError('Empty payload')
  }

  if (payload.length > ISO_TP_MAX_LENGTH) {
    throw new IsotpOverflowError(
      `Payload length ${payload.length} exceeds maximum ${ISO_TP_MAX_LENGTH} bytes`,
    )
  }

  const sfCapacity = mtu - SF_OVERHEAD
  if (payload.length <= sfCapacity) {
    return [buildSingleFrame(payload)]
  }

  const ffPayloadCapacity = mtu - FF_OVERHEAD
  const cfPayloadCapacity = mtu - CF_OVERHEAD

  const firstFrame = buildFirstFrame(payload, payload.length, ffPayloadCapacity)
  const cfFrames = buildConsecutiveFrames(
    payload,
    ffPayloadCapacity,
    payload.length,
    cfPayloadCapacity,
  )

  return [firstFrame, ...cfFrames]
}

/** Re-exporta errores de frameTypes para conveniencia del consumidor. */
export { IsotpOverflowError, IsotpFrameError }
