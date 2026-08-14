import { describe, it, expect } from 'vitest'
import { selectAdapterCandidates } from '../../../scripts/probeCandidates.js'

/** Puertos serie fantasma que Linux expone siempre, aunque no haya nada enchufado. */
const PHANTOM_LINUX = Array.from({ length: 32 }, (_, i) => `/dev/ttyS${i}`)

describe('selectAdapterCandidates', () => {
  it('should discard the phantom /dev/ttyS* ports Linux always exposes', () => {
    expect(selectAdapterCandidates(PHANTOM_LINUX)).toEqual([])
  })

  it('should keep a CH340 clone among the phantom ports', () => {
    const ports = [...PHANTOM_LINUX, '/dev/ttyUSB0']
    expect(selectAdapterCandidates(ports)).toEqual(['/dev/ttyUSB0'])
  })

  it('should keep an STN adapter, which enumerates as ttyACM', () => {
    expect(selectAdapterCandidates(['/dev/ttyS0', '/dev/ttyACM0'])).toEqual(['/dev/ttyACM0'])
  })

  it.each([
    '/dev/cu.usbserial-1420',
    '/dev/cu.usbmodem14201',
    '/dev/cu.SLAB_USBtoUART',
    '/dev/cu.wchusbserial1420',
  ])('should keep the macOS callout device %s', (path) => {
    expect(selectAdapterCandidates([path])).toEqual([path])
  })

  it('should discard the macOS Bluetooth callout, which is never the adapter', () => {
    expect(selectAdapterCandidates(['/dev/cu.Bluetooth-Incoming-Port'])).toEqual([])
  })

  it('should keep a bound rfcomm device for a Bluetooth adapter', () => {
    expect(selectAdapterCandidates(['/dev/rfcomm0'])).toEqual(['/dev/rfcomm0'])
  })

  it('should preserve discovery order so the first match is tried first', () => {
    const ports = ['/dev/ttyS0', '/dev/ttyUSB1', '/dev/ttyS1', '/dev/ttyUSB0']
    expect(selectAdapterCandidates(ports)).toEqual(['/dev/ttyUSB1', '/dev/ttyUSB0'])
  })
})
