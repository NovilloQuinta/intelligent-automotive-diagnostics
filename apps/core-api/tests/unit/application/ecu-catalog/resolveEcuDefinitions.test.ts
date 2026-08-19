import { describe, it, expect } from 'vitest'
import {
  resolveEcuDefinitions,
  RESOLVE_CONFIDENCE_THRESHOLD,
} from '@/application/ecu-catalog/resolveEcuDefinitions.js'
import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { EcuDefinition } from '@/domain/entities/EcuDefinition.js'

function unknownEcu(responseAddr: string): EcuInfo {
  return new EcuInfo({
    id: 0,
    vehicleId: 0,
    name: `ECU ${responseAddr}`,
    requestAddr: (parseInt(responseAddr, 16) - 8).toString(16).toUpperCase().padStart(3, '0'),
    responseAddr,
    type: 'UNKNOWN',
    protocol: 'CAN_11_500',
  })
}

function ecuDefinition(overrides: Partial<ConstructorParameters<typeof EcuDefinition>[0]> = {}) {
  return new EcuDefinition({
    id: 1,
    manufacturer: 'Audi',
    model: 'A3',
    responseAddr: '7E9',
    requestAddr: '7E1',
    name: 'Transmission Control Module',
    type: 'TCM',
    confidence: 0.8,
    source: 'mechanic',
    ...overrides,
  })
}

describe('resolveEcuDefinitions', () => {
  it(`should resolve an UNKNOWN ECU when a definition has confidence >= ${RESOLVE_CONFIDENCE_THRESHOLD}`, () => {
    const ecus = [unknownEcu('7E9')]
    const lookup = (addr: string) => (addr === '7E9' ? ecuDefinition() : undefined)

    const resolved = resolveEcuDefinitions(ecus, lookup)

    expect(resolved[0].name).toBe('Transmission Control Module')
    expect(resolved[0].type).toBe('TCM')
    expect(resolved[0].responseAddr).toBe('7E9')
  })

  it('should keep UNKNOWN when there is no matching definition', () => {
    const ecus = [unknownEcu('7DA')]

    const resolved = resolveEcuDefinitions(ecus, () => undefined)

    expect(resolved[0].type).toBe('UNKNOWN')
    expect(resolved[0].name).toBe('ECU 7DA')
  })

  it('should keep UNKNOWN when confidence is below the threshold', () => {
    const ecus = [unknownEcu('7E9')]
    const lookup = (addr: string) =>
      addr === '7E9' ? ecuDefinition({ confidence: 0.3, source: 'web' }) : undefined

    const resolved = resolveEcuDefinitions(ecus, lookup)

    expect(resolved[0].type).toBe('UNKNOWN')
    expect(resolved[0].name).toBe('ECU 7E9')
  })

  it('should leave already-resolved ECUs (e.g. ECM) untouched', () => {
    const ecm = new EcuInfo({
      id: 0,
      vehicleId: 0,
      name: 'Engine Control Module',
      requestAddr: '7E0',
      responseAddr: '7E8',
      type: 'ECM',
      protocol: 'CAN_11_500',
    })
    const ecus = [ecm, unknownEcu('7E9')]

    const resolved = resolveEcuDefinitions(ecus, (addr) =>
      addr === '7E9' ? ecuDefinition() : undefined,
    )

    expect(resolved[0]).toBe(ecm)
    expect(resolved[1].type).toBe('TCM')
  })
})
