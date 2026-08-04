/** Barrel export del modulo ISO-TP (ISO 15765-2).
 *
 * Provee tipos de trama CAN, parser/builder de PCI byte,
 * reassembler (frames → payload) y segmenter (payload → frames). */

// eslint-disable-next-line jsdoc/require-jsdoc
export {
  FrameType,
  type CanFrame,
  type IsotpFrameInfo,
  parsePci,
  buildPci,
  IsotpFrameError,
  IsotpSequenceError,
  IsotpOverflowError,
  IsotpTruncatedError,
} from './frameTypes.js'

// eslint-disable-next-line jsdoc/require-jsdoc
export { reassembleFrames } from './reassembler.js'

// eslint-disable-next-line jsdoc/require-jsdoc
export { segmentPayload } from './segmenter.js'
