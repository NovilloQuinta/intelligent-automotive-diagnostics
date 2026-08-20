import { describe, it, expect, vi } from 'vitest'
import { GetVehicleInfoUseCase } from '@/application/use-cases/GetVehicleInfoUseCase.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { ResolveVehicleIdentityUseCase } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/Vin.js'

const AUDI_VIN = 'WAUZZZ8V5JA123456'

function mockRepo(info: Partial<ConstructorParameters<typeof VehicleInfo>[0]> = {}): ObdRepository {
  return {
    getVehicleInfo: vi.fn().mockResolvedValue(
      new VehicleInfo({
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TDI',
        vin: new Vin(AUDI_VIN),
        ...info,
      }),
    ),
  } as unknown as ObdRepository
}

/** Resolver de identidad que devuelve un fabricante conocido, o nada si `origin: 'none'`. */
function mockResolver(origin: 'catalog' | 'none' = 'catalog'): ResolveVehicleIdentityUseCase {
  return {
    execute: vi.fn().mockResolvedValue({
      origin,
      make: origin === 'none' ? 'unknown' : 'Audi AG',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TDI',
    }),
  } as unknown as ResolveVehicleIdentityUseCase
}

function buildUseCase(origin: 'catalog' | 'none' = 'catalog'): GetVehicleInfoUseCase {
  return new GetVehicleInfoUseCase({ identityResolver: mockResolver(origin) })
}

describe('GetVehicleInfoUseCase', () => {
  it('should return what the adapter reports when there is no scenario descriptor', async () => {
    const result = await buildUseCase().execute(mockRepo())

    expect(result.vin).toBe(AUDI_VIN)
    expect(result.make).toBe('Audi')
    expect(result.model).toBe('A3')
    expect(result.vinStatus).toBe('read')
  })

  it('should let the scenario descriptor override the adapter metadata', async () => {
    const result = await buildUseCase().execute(mockRepo(), {
      make: 'Toyota',
      model: 'Corolla',
      year: 2020,
      engineType: '1.8 Hybrid',
    })

    expect(result.make).toBe('Toyota')
    expect(result.model).toBe('Corolla')
    expect(result.year).toBe(2020)
    expect(result.engineType).toBe('1.8 Hybrid')
    // El VIN nunca lo pisa el descriptor: sale de la ECU.
    expect(result.vin).toBe(AUDI_VIN)
  })

  it('should preserve the unreadable status the adapter reports', async () => {
    // Es el adaptador quien clasifica la lectura fallida: `unsupported` si el ECU
    // responde NO DATA, `unreadable` en cualquier otro fallo. Aqui solo se propaga.
    const result = await buildUseCase().execute(
      mockRepo({ vin: new Vin(FALLBACK_VIN), vinStatus: 'unreadable' }),
    )

    expect(result.vinStatus).toBe('unreadable')
  })

  it('should not decode the fallback VIN, placeholder that it is', async () => {
    const result = await buildUseCase().execute(mockRepo({ vin: new Vin(FALLBACK_VIN) }))

    expect(result.manufacturer).toBeNull()
    expect(result.region).toBeNull()
    expect(result.modelYearDecoded).toBeNull()
  })

  it('should decode manufacturer and region from a real VIN', async () => {
    const result = await buildUseCase().execute(mockRepo())

    expect(result.manufacturer).toBe('Audi AG')
    expect(result.region).not.toBeNull()
    expect(result.modelYearDecoded).not.toBeNull()
  })

  it('should leave the manufacturer null when the cascade resolves nothing', async () => {
    const result = await buildUseCase('none').execute(mockRepo())

    expect(result.manufacturer).toBeNull()
  })

  it('should keep the vinStatus the adapter reports over the derived one', async () => {
    const result = await buildUseCase().execute(mockRepo({ vinStatus: 'unsupported' }))

    expect(result.vinStatus).toBe('unsupported')
  })
})
