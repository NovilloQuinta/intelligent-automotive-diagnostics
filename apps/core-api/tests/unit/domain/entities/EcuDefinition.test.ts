import { describe, it, expect } from 'vitest'
import { EcuDefinition, EcuDefinitionError } from '@/domain/entities/EcuDefinition.js'

type EcuDefinitionParams = ConstructorParameters<typeof EcuDefinition>[0]

function buildEcuDefinition(overrides: Partial<EcuDefinitionParams> = {}): EcuDefinition {
  return new EcuDefinition({
    id: 1,
    manufacturer: 'Audi',
    model: 'A3',
    responseAddr: '7e9',
    requestAddr: '7e1',
    name: 'Transmission Control Module',
    type: 'TCM',
    confidence: 0.8,
    source: 'mechanic',
    ...overrides,
  })
}

describe('EcuDefinition', () => {
  it('should normalize addresses to uppercase and expose system when provided', () => {
    const def = buildEcuDefinition({ system: 'Transmission' })

    expect(def.responseAddr).toBe('7E9')
    expect(def.requestAddr).toBe('7E1')
    expect(def.system).toBe('Transmission')
    expect(buildEcuDefinition().system).toBeUndefined()
  })

  it('should throw EcuDefinitionError when name is empty', () => {
    expect(() => buildEcuDefinition({ name: '   ' })).toThrow(EcuDefinitionError)
  })

  it('should throw EcuDefinitionError when addresses are not hex', () => {
    expect(() => buildEcuDefinition({ responseAddr: 'GGGG' })).toThrow(EcuDefinitionError)
    expect(() => buildEcuDefinition({ requestAddr: 'xyz' })).toThrow(EcuDefinitionError)
  })

  it('should throw EcuDefinitionError when confidence is outside [0,1]', () => {
    expect(() => buildEcuDefinition({ confidence: 1.5 })).toThrow(EcuDefinitionError)
    expect(() => buildEcuDefinition({ confidence: -0.1 })).toThrow(EcuDefinitionError)
  })

  it('should accept web and mechanic as source', () => {
    expect(buildEcuDefinition({ source: 'web' }).source).toBe('web')
    expect(buildEcuDefinition({ source: 'mechanic' }).source).toBe('mechanic')
  })

  it('should throw EcuDefinitionError when source is not web or mechanic', () => {
    expect(() => buildEcuDefinition({ source: 'seed' })).toThrow(EcuDefinitionError)
  })
})
