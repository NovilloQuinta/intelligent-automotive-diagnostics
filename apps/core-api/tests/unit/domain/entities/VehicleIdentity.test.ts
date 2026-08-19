import { describe, it, expect } from 'vitest'
import { VehicleIdentity, VehicleIdentityError } from '@/domain/entities/VehicleIdentity.js'

/**
 * Identidad de fabricante aprendida por WMI.
 *
 * Es la entrada del catalogo que responde "quien fabrico este coche" a partir de
 * los 3 primeros caracteres del VIN. La normalizacion vive aqui y no en el
 * formulario: la API es otra puerta de entrada y tiene que pasar por la misma.
 */

function identity(overrides: Partial<ConstructorParameters<typeof VehicleIdentity>[0]> = {}) {
  return new VehicleIdentity({
    id: 0,
    wmi: 'VF3',
    manufacturer: 'Peugeot',
    confidence: 0.9,
    source: 'seed',
    ...overrides,
  })
}

describe('VehicleIdentity', () => {
  it('normaliza el WMI a mayusculas', () => {
    expect(identity({ wmi: 'vf3' }).wmi).toBe('VF3')
  })

  it('rechaza un WMI que no tenga 3 caracteres', () => {
    expect(() => identity({ wmi: 'VF' })).toThrow(VehicleIdentityError)
    expect(() => identity({ wmi: 'VF33' })).toThrow(VehicleIdentityError)
  })

  it('rechaza un WMI con caracteres prohibidos por la ISO 3779', () => {
    // I, O y Q no existen en un VIN: se confunden con 1 y 0.
    expect(() => identity({ wmi: 'VIF' })).toThrow(VehicleIdentityError)
    expect(() => identity({ wmi: 'VQ3' })).toThrow(VehicleIdentityError)
  })

  it('normaliza el fabricante con la misma regla que el resto del catalogo', () => {
    // Reutiliza normalizeManufacturer: sin esto, "peugeot" y "Peugeot" serian
    // dos entradas distintas de la clave de busqueda del catalogo.
    expect(identity({ manufacturer: 'peugeot' }).manufacturer).toBe('Peugeot')
    expect(identity({ manufacturer: '  vw ag  ' }).manufacturer).toBe('Volkswagen')
  })

  it('rechaza un fabricante vacio o que se quede vacio al normalizar', () => {
    expect(() => identity({ manufacturer: '   ' })).toThrow(VehicleIdentityError)
  })

  it('rechaza un fabricante absurdamente largo', () => {
    expect(() => identity({ manufacturer: 'A'.repeat(65) })).toThrow(VehicleIdentityError)
  })

  it('rechaza una confianza fuera de [0,1]', () => {
    expect(() => identity({ confidence: 1.5 })).toThrow(VehicleIdentityError)
    expect(() => identity({ confidence: -0.1 })).toThrow(VehicleIdentityError)
  })

  it('rechaza una procedencia que no sea seed, web o mechanic', () => {
    expect(() => identity({ source: 'previous_diagnosis' })).toThrow(VehicleIdentityError)
  })

  it('acepta las tres procedencias de la cascada', () => {
    for (const source of ['seed', 'web', 'mechanic'] as const) {
      expect(identity({ source }).source).toBe(source)
    }
  })
})
