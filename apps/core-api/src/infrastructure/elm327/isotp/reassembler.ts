import {
  type CanFrame,
  parsePci,
  FrameType,
  type IsotpFrameInfo,
  IsotpFrameError,
  IsotpSequenceError,
  IsotpOverflowError,
  IsotpTruncatedError,
} from './frameTypes.js'

const ISO_TP_MAX_LENGTH = 4095
const FF_PAYLOAD_OFFSET = 2
const CF_PAYLOAD_OFFSET = 1
const SF_PAYLOAD_OFFSET = 1
const MAX_CF_PAYLOAD = 7
const MAX_FF_PAYLOAD = 6

function validateNotEmpty(frames: CanFrame[]): void {
  if (frames.length === 0) {
    throw new IsotpFrameError('Empty frames array')
  }
}

function validateFrameData(frame: CanFrame): void {
  if (!frame.data || frame.data.length === 0) {
    throw new IsotpFrameError('Frame has no data')
  }
}

function handleSingleFrame(frame: CanFrame, info: IsotpFrameInfo, allFrames: CanFrame[]): number[] {
  if (allFrames.length > 1) {
    throw new IsotpFrameError('Expected only one Single Frame')
  }
  const dataLength = info.dataLength ?? 0
  return frame.data.slice(SF_PAYLOAD_OFFSET, SF_PAYLOAD_OFFSET + dataLength)
}

function extractTotalLength(pci: number, data: readonly number[]): number {
  if (data.length < FF_PAYLOAD_OFFSET) {
    throw new IsotpFrameError('First Frame too short: missing length byte')
  }
  return ((pci & 0x0f) << 8) | data[1]
}

function checkOverflow(totalLength: number): void {
  /* v8 ignore next 4 — unreachable: FF 12-bit length field max is 4095 */
  if (totalLength > ISO_TP_MAX_LENGTH) {
    throw new IsotpOverflowError(
      `Declared length ${totalLength} exceeds maximum ${ISO_TP_MAX_LENGTH} bytes`,
    )
  }
}

function extractFirstFramePayload(firstFrame: CanFrame): number[] {
  const payload: number[] = []
  const ffPayloadEnd = Math.min(firstFrame.data.length, FF_PAYLOAD_OFFSET + MAX_FF_PAYLOAD)
  for (let i = FF_PAYLOAD_OFFSET; i < ffPayloadEnd; i++) {
    payload.push(firstFrame.data[i])
  }
  return payload
}

/** Valida que el numero de secuencia sea contiguo modulo 16.
 * @param prev — numero de secuencia del CF anterior.
 * @param current — numero de secuencia del CF actual.
 * @throws IsotpSequenceError — si hay un gap en la secuencia. */
function validateSequence(prev: number, current: number): void {
  const expected = (prev + 1) & 0x0f
  if (current !== expected) {
    throw new IsotpSequenceError(expected, current)
  }
}

function processConsecutiveFrames(
  frames: CanFrame[],
  startIndex: number,
  totalLength: number,
  payload: number[],
): void {
  let lastSeq = 0

  for (let fi = startIndex; fi < frames.length; fi++) {
    const frame = frames[fi]
    if (!frame.data || frame.data.length <= CF_PAYLOAD_OFFSET) {
      throw new IsotpFrameError('Frame has insufficient data')
    }

    const cfInfo = parsePci(frame.data[0])
    if (cfInfo.type !== FrameType.CONSECUTIVE) {
      throw new IsotpFrameError(
        `Expected Consecutive Frame, got frame type ${cfInfo.type} at position ${fi}`,
      )
    }

    const seqNum = cfInfo.sequenceNumber ?? 0
    validateSequence(lastSeq, seqNum)
    lastSeq = seqNum

    const remaining = totalLength - payload.length
    const cfPayloadLen = Math.min(frame.data.length - CF_PAYLOAD_OFFSET, MAX_CF_PAYLOAD, remaining)

    for (let i = CF_PAYLOAD_OFFSET; i < CF_PAYLOAD_OFFSET + cfPayloadLen; i++) {
      payload.push(frame.data[i])
    }
  }
}

/** Reensambla un array de tramas CAN ISO-TP en el payload completo.
 * Soporta Single Frame (SF) y multi-frame (FF + CFs).
 * @param frames — array de {@link CanFrame} con PCI byte en la primera posicion.
 * @returns Payload reensamblado sin bytes de control (PCI, length).
 * @throws IsotpFrameError — si el array esta vacio, hay CF sin FF previo, o PCI invalido.
 * @throws IsotpSequenceError — si hay gap en los numeros de secuencia de CF.
 * @throws IsotpOverflowError — si la longitud total declarada en el FF excede 4095 bytes.
 * @throws IsotpTruncatedError — si el payload recibido es menor que la longitud declarada.
 */
export function reassembleFrames(frames: CanFrame[]): number[] {
  validateNotEmpty(frames)

  const firstFrame = frames[0]
  validateFrameData(firstFrame)

  const pci = firstFrame.data[0]
  const info = parsePci(pci)

  if (info.type === FrameType.SINGLE) {
    return handleSingleFrame(firstFrame, info, frames)
  }

  if (info.type !== FrameType.FIRST) {
    throw new IsotpFrameError('First frame must be SF or FF, got CF or FC without prior FF')
  }

  const totalLength = extractTotalLength(pci, firstFrame.data)
  checkOverflow(totalLength)

  const payload = extractFirstFramePayload(firstFrame)
  processConsecutiveFrames(frames, 1, totalLength, payload)

  if (payload.length < totalLength) {
    throw new IsotpTruncatedError(
      `Payload truncated: expected ${totalLength} bytes, received ${payload.length}`,
    )
  }

  return payload
}
