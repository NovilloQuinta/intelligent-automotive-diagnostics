import { describe, it, expect, vi } from 'vitest'
import { ConfirmVehicleIdentityUseCase } from '@/application/use-cases/ConfirmVehicleIdentityUseCase.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * Lo que aporta el mecanico cuando la cascada no saca el coche.
 *
 * Es la fuente mas fiable que existe — esta delante del vehiculo — y a la vez la
 * mas peligrosa: nace con confianza 0.8, por encima de la web (0.3), asi que un
 * dato mal tecleado gana a un resultado correcto de internet. De ahi las
 * barreras.
 */

const testLogger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

/** Posicion 10 = 'M' → 2021 segun ISO 3779. */
const PEUGEOT_VIN = new Vin('VR3ABCDEFM1234567')

function repoStub(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    findVehicleIdentityByWmi: vi.fn().mockResolvedValue(null),
    upsertVehicleIdentity: vi.fn(async (i) => new VehicleIdentity({ id: 1, ...i })),
    upsertVehicle: vi.fn(async (p: VehicleProfile) => new VehicleProfile({ ...p, id: 5 })),
    ...overrides,
  } as unknown as VehicleRepository
}

function useCaseWith(vehicleRepo: VehicleRepository) {
  return new ConfirmVehicleIdentityUseCase({ vehicleRepo, logger: testLogger })
}

describe('ConfirmVehicleIdentityUseCase', () => {
  it('guarda en el vehículo lo que dice el mecánico, normalizado', async () => {
    const vehicleRepo = repoStub()

    const result = await useCaseWith(vehicleRepo).execute({
      vin: PEUGEOT_VIN,
      make: '  peugeot ',
      model: '  208  ',
      engineType: '1.5 BlueHDi',
    })

    const profile = (vehicleRepo.upsertVehicle as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as VehicleProfile
    expect(profile.make).toBe('Peugeot')
    expect(profile.model).toBe('208')
    expect(result.vehicle.make).toBe('Peugeot')
  })

  it('barrera 1: el modelo nunca sube al catálogo por WMI', async () => {
    // Un VF3 es un 208, un 308 o un 3008: subir el modelo a la clave del WMI
    // seria falso aunque el mecanico hubiese acertado con SU coche.
    const vehicleRepo = repoStub()

    await useCaseWith(vehicleRepo).execute({
      vin: PEUGEOT_VIN,
      make: 'Peugeot',
      model: '208',
    })

    const identity = (vehicleRepo.upsertVehicleIdentity as ReturnType<typeof vi.fn>).mock
      .calls[0][0]
    expect(identity).not.toHaveProperty('model')
    expect(identity.wmi).toBe('VR3')
    expect(identity.manufacturer).toBe('Peugeot')
  })

  it('promociona la marca al catálogo cuando el WMI no se conocía', async () => {
    const vehicleRepo = repoStub()

    const result = await useCaseWith(vehicleRepo).execute({ vin: PEUGEOT_VIN, make: 'Peugeot' })

    expect(result.promoted).toBe(true)
    expect(vehicleRepo.upsertVehicleIdentity).toHaveBeenCalledWith(
      expect.objectContaining({ wmi: 'VR3', manufacturer: 'Peugeot', source: 'mechanic' }),
    )
  })

  it('barrera 4: no pisa en silencio una marca ya conocida para ese WMI', async () => {
    const vehicleRepo = repoStub({
      findVehicleIdentityByWmi: vi.fn().mockResolvedValue(
        new VehicleIdentity({
          id: 1,
          wmi: 'VR3',
          manufacturer: 'Peugeot',
          confidence: 0.9,
          source: 'seed',
        }),
      ),
    })

    const result = await useCaseWith(vehicleRepo).execute({ vin: PEUGEOT_VIN, make: 'Ferrari' })

    expect(result.promoted).toBe(false)
    expect(result.conflict).toEqual({ known: 'Peugeot', claimed: 'Ferrari' })
    expect(vehicleRepo.upsertVehicleIdentity).not.toHaveBeenCalled()
  })

  it('un conflicto de marca no impide guardar el vehículo', async () => {
    // Puede ser una importacion o un VIN atipico: el coche del mecanico es suyo,
    // lo que no puede es reescribir la marca de todo un WMI.
    const vehicleRepo = repoStub({
      findVehicleIdentityByWmi: vi.fn().mockResolvedValue(
        new VehicleIdentity({
          id: 1,
          wmi: 'VR3',
          manufacturer: 'Peugeot',
          confidence: 0.9,
          source: 'seed',
        }),
      ),
    })

    const result = await useCaseWith(vehicleRepo).execute({ vin: PEUGEOT_VIN, make: 'Ferrari' })

    expect(vehicleRepo.upsertVehicle).toHaveBeenCalledTimes(1)
    expect(result.vehicle.make).toBe('Ferrari')
  })

  it('confirmar la misma marca que ya se sabía no es conflicto', async () => {
    const vehicleRepo = repoStub({
      findVehicleIdentityByWmi: vi.fn().mockResolvedValue(
        new VehicleIdentity({
          id: 1,
          wmi: 'VR3',
          manufacturer: 'Peugeot',
          confidence: 0.3,
          source: 'web',
        }),
      ),
    })

    // 'peugeot' normaliza a 'Peugeot': la comparacion es sobre el valor normalizado.
    const result = await useCaseWith(vehicleRepo).execute({ vin: PEUGEOT_VIN, make: 'peugeot' })

    expect(result.conflict).toBeUndefined()
    expect(result.promoted).toBe(true)
  })

  it('barrera 3: avisa si el año no cuadra con la posición 10 del VIN', async () => {
    const vehicleRepo = repoStub()

    const result = await useCaseWith(vehicleRepo).execute({
      vin: PEUGEOT_VIN,
      make: 'Peugeot',
      year: 2015,
    })

    expect(result.warnings.join(' ')).toMatch(/2021/)
    // Es un aviso, no un bloqueo: el VIN europeo puede no codificar el anio.
    expect(result.vehicle.year).toBe(2015)
  })

  it('sin año del mecánico, usa el del VIN sin avisar de nada', async () => {
    const result = await useCaseWith(repoStub()).execute({ vin: PEUGEOT_VIN, make: 'Peugeot' })

    expect(result.vehicle.year).toBe(2021)
    expect(result.warnings).toEqual([])
  })

  it('barrera 5: rechaza una marca que no tiene forma de nombre', async () => {
    const vehicleRepo = repoStub()

    await expect(
      useCaseWith(vehicleRepo).execute({ vin: PEUGEOT_VIN, make: '   ' }),
    ).rejects.toThrow()

    expect(vehicleRepo.upsertVehicle).not.toHaveBeenCalled()
  })
})
