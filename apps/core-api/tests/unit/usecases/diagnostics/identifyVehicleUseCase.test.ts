import { describe, it, expect, vi } from 'vitest'
import { IdentifyVehicleUseCase } from '@/application/use-cases/IdentifyVehicleUseCase.js'
import type { ResolveVehicleIdentityUseCase } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { UNKNOWN_VEHICLE_FIELD } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { Vin } from '@/domain/value-objects/Vin.js'

const VIN = 'WAUZZZ8V5JA123456'

function unknownVehicle(
  overrides: Partial<{ model: string; year: number; engineType: string }> = {},
) {
  return new VehicleInfo({
    make: UNKNOWN_VEHICLE_FIELD,
    model: UNKNOWN_VEHICLE_FIELD,
    year: 0,
    engineType: UNKNOWN_VEHICLE_FIELD,
    vin: new Vin(VIN),
    ...overrides,
  })
}

function mockResolver(origin: 'catalog' | 'none' = 'catalog'): ResolveVehicleIdentityUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      origin,
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TDI',
    }),
  } as unknown as ResolveVehicleIdentityUseCase
}

describe('IdentifyVehicleUseCase', () => {
  it('should fill in the missing fields from the identity cascade', async () => {
    const useCase = new IdentifyVehicleUseCase({ identityResolver: mockResolver() })

    const result = await useCase.execute(unknownVehicle())

    expect(result.make).toBe('Audi')
    expect(result.model).toBe('A3')
    expect(result.year).toBe(2018)
    expect(result.engineType).toBe('2.0 TDI')
  })

  it('should not run the cascade when the make is already known', async () => {
    const resolver = mockResolver()
    const useCase = new IdentifyVehicleUseCase({ identityResolver: resolver })
    const known = new VehicleInfo({
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      engineType: '1.8',
      vin: new Vin(VIN),
    })

    const result = await useCase.execute(known)

    expect(result.make).toBe('Toyota')
    expect(resolver.execute).not.toHaveBeenCalled()
  })

  it('should respect the fields the adapter already knows', async () => {
    const useCase = new IdentifyVehicleUseCase({ identityResolver: mockResolver() })

    const result = await useCase.execute(unknownVehicle({ model: 'S3', year: 2019 }))

    expect(result.make).toBe('Audi')
    expect(result.model).toBe('S3')
    expect(result.year).toBe(2019)
  })

  it('should return the vehicle untouched when the cascade resolves nothing', async () => {
    const useCase = new IdentifyVehicleUseCase({ identityResolver: mockResolver('none') })

    const result = await useCase.execute(unknownVehicle())

    expect(result.make).toBe(UNKNOWN_VEHICLE_FIELD)
  })

  it('should preserve the VIN and its read status', async () => {
    const useCase = new IdentifyVehicleUseCase({ identityResolver: mockResolver() })
    const unreadable = new VehicleInfo({
      make: UNKNOWN_VEHICLE_FIELD,
      model: UNKNOWN_VEHICLE_FIELD,
      year: 0,
      engineType: UNKNOWN_VEHICLE_FIELD,
      vin: new Vin(VIN),
      vinStatus: 'unsupported',
    })

    const result = await useCase.execute(unreadable)

    expect(String(result.vin)).toBe(VIN)
    expect(result.vinStatus).toBe('unsupported')
  })

  it('should project the identified vehicle to a persistable profile', () => {
    const useCase = new IdentifyVehicleUseCase({ identityResolver: mockResolver() })

    const profile = useCase.toVehicleProfile(
      new VehicleInfo({
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TDI',
        vin: new Vin(VIN),
      }),
    )

    // `id: 0` indica clave autogenerada en la capa de persistencia.
    expect(profile.id).toBe(0)
    expect(profile.make).toBe('Audi')
    expect(String(profile.vin)).toBe(VIN)
  })
})
