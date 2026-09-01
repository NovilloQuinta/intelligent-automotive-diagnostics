import { describe, it, expect } from 'vitest'
import { resolveEcuDefinitions } from '@/application/ecu-catalog/resolveEcuDefinitions.js'
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
  it('should resolve an UNKNOWN ECU from a learned definition', () => {
    const ecus = [unknownEcu('7E9')]
    const lookup = (addr: string) => (addr === '7E9' ? ecuDefinition() : undefined)

    const resolved = resolveEcuDefinitions(ecus, lookup)

    expect(resolved[0].name).toBe('Transmission Control Module')
    expect(resolved[0].type).toBe('TCM')
    expect(resolved[0].responseAddr).toBe('7E9')
  })

  it('should NOT mark as AI-sourced a definition from `mechanic` or `seed`', () => {
    const ecus = [unknownEcu('7E9'), unknownEcu('7EA')]
    const lookup = (addr: string) => {
      if (addr === '7E9') return ecuDefinition({ source: 'mechanic' })
      if (addr === '7EA') return ecuDefinition({ responseAddr: '7EA', source: 'seed' })
      return undefined
    }

    const resolved = resolveEcuDefinitions(ecus, lookup)

    expect(resolved[0].source).toBe('catalog')
    expect(resolved[1].source).toBe('catalog')
  })

  it('should keep UNKNOWN when there is no matching definition', () => {
    const ecus = [unknownEcu('7DA')]

    const resolved = resolveEcuDefinitions(ecus, () => undefined)

    expect(resolved[0].type).toBe('UNKNOWN')
    expect(resolved[0].name).toBe('ECU 7DA')
  })

  it('should resolve a low-confidence definition too, marked as AI-sourced', () => {
    // 0.3 es la unica confianza que el agente puede producir (procedencia `web`). Si se
    // filtrara por confianza, nada de lo que aprende se mostraria jamas. La advertencia no
    // es ocultarlo: es la marca `IA` que lo distingue de lo que dicta la norma.
    const ecus = [unknownEcu('7E9')]
    const lookup = (addr: string) =>
      addr === '7E9' ? ecuDefinition({ confidence: 0.3, source: 'web' }) : undefined

    const resolved = resolveEcuDefinitions(ecus, lookup)

    expect(resolved[0].name).toBe('Transmission Control Module')
    expect(resolved[0].type).toBe('TCM')
    expect(resolved[0].source).toBe('ai')
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
