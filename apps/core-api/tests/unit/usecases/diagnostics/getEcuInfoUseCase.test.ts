import { describe, it, expect, vi } from 'vitest'
import { GetEcuInfoUseCase } from '@/application/use-cases/GetEcuInfoUseCase.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
import { VehicleProfile } from '@/domain/entities/VehicleProfile.js'
import { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { Vin } from '@/domain/value-objects/Vin.js'
import { ECU_TYPE_UNKNOWN } from '@/domain/catalogs/ecuAddressCatalog.js'
import {
  UNKNOWN_VEHICLE_FIELD,
  type ResolveVehicleIdentityUseCase,
} from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { IdentifyVehicleUseCase } from '@/application/use-cases/IdentifyVehicleUseCase.js'

const VIN = 'WAUZZZ8V5JA123456'

/** ECM: la unica direccion que estandariza ISO 15765-4, asi que nunca se resuelve del catalogo. */
function ecm(): EcuInfo {
  return new EcuInfo({
    id: 0,
    vehicleId: 0,
    name: 'Engine Control Module',
    requestAddr: '7E0',
    responseAddr: '7E8',
    type: 'ECM',
    protocol: 'ISO 15765-4 CAN 11/500',
  })
}

/** ECU sin catalogar: la que el agente puede aprender. */
function unknownEcu(): EcuInfo {
  return new EcuInfo({
    id: 0,
    vehicleId: 0,
    name: 'ECU 7E9',
    requestAddr: '7E1',
    responseAddr: '7E9',
    type: ECU_TYPE_UNKNOWN,
    protocol: 'ISO 15765-4 CAN 11/500',
  })
}

function identifiedVehicle(make = 'Audi', model = 'A3'): VehicleInfo {
  return new VehicleInfo({
    make,
    model,
    year: 2018,
    engineType: '2.0 TDI',
    vin: new Vin(VIN),
  })
}

function mockObdRepo(ecus: EcuInfo[], vehicle = identifiedVehicle()): ObdRepository {
  return {
    getEcuInfo: vi.fn().mockResolvedValue(ecus),
    getVehicleInfo: vi.fn().mockResolvedValue(vehicle),
  } as unknown as ObdRepository
}

function mockVehicleRepo(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    upsertVehicle: vi.fn().mockResolvedValue(
      new VehicleProfile({
        id: 7,
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TDI',
        vin: new Vin(VIN),
      }),
    ),
    findEcuByAddress: vi.fn().mockResolvedValue(null),
    insertEcu: vi.fn().mockResolvedValue(undefined),
    updateEcuDiscoveredAt: vi.fn().mockResolvedValue(undefined),
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as VehicleRepository
}

function mockLogger(): LoggerPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerPort
}

function buildUseCase(
  vehicleRepo: VehicleRepository | undefined,
  logger: LoggerPort = mockLogger(),
): GetEcuInfoUseCase {
  // El vehiculo ya llega identificado en estos casos, asi que la cascada no se ejercita:
  // lo suyo se prueba en identifyVehicleUseCase.test.ts.
  const identifyVehicle = new IdentifyVehicleUseCase({
    identityResolver: { execute: vi.fn() } as unknown as ResolveVehicleIdentityUseCase,
  })
  return new GetEcuInfoUseCase({ vehicleRepo, logger, identifyVehicle })
}

function learnedDefinition(confidence: number): EcuDefinition {
  return new EcuDefinition({
    id: 1,
    manufacturer: 'Audi',
    model: 'A3',
    responseAddr: '7E9',
    requestAddr: '7E1',
    name: 'Caja de cambios',
    type: 'TCM',
    confidence,
    source: 'web',
  })
}

describe('GetEcuInfoUseCase', () => {
  it('should return the ECUs discovered on the bus', async () => {
    const useCase = buildUseCase(mockVehicleRepo())

    const result = await useCase.execute(mockObdRepo([ecm(), unknownEcu()]))

    expect(result.map((e) => e.responseAddr)).toEqual(['7E8', '7E9'])
  })

  it('should resolve a learned ECU name and mark it as AI-sourced', async () => {
    const vehicleRepo = mockVehicleRepo({
      findEcuDefinitionByAddress: vi.fn().mockResolvedValue(learnedDefinition(0.9)),
    })
    const useCase = buildUseCase(vehicleRepo)

    const result = await useCase.execute(mockObdRepo([unknownEcu()]))

    expect(result[0].name).toBe('Caja de cambios')
    expect(result[0].type).toBe('TCM')
    expect(result[0].source).toBe('ai')
  })

  it('should keep the ECU unresolved when the vehicle is not identified', async () => {
    const vehicleRepo = mockVehicleRepo({
      findEcuDefinitionByAddress: vi.fn().mockResolvedValue(learnedDefinition(0.9)),
    })
    const useCase = buildUseCase(vehicleRepo)
    const unidentified = mockObdRepo(
      [unknownEcu()],
      identifiedVehicle(UNKNOWN_VEHICLE_FIELD, UNKNOWN_VEHICLE_FIELD),
    )

    const result = await useCase.execute(unidentified)

    expect(result[0].name).toBe('ECU 7E9')
    expect(result[0].source).toBe('catalog')
  })

  it('should persist the discovered ECUs against the active vehicle', async () => {
    const vehicleRepo = mockVehicleRepo()
    const useCase = buildUseCase(vehicleRepo)

    await useCase.execute(mockObdRepo([ecm()]))
    await vi.waitFor(() => expect(vehicleRepo.insertEcu).toHaveBeenCalledTimes(1))

    expect(vehicleRepo.upsertVehicle).toHaveBeenCalled()
  })

  it('should still return the ECUs when the catalog lookup fails', async () => {
    const logger = mockLogger()
    const vehicleRepo = mockVehicleRepo({
      findEcuDefinitionByAddress: vi.fn().mockRejectedValue(new Error('catalog down')),
    })
    const useCase = buildUseCase(vehicleRepo, logger)

    const result = await useCase.execute(mockObdRepo([unknownEcu()]))

    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('ECU 7E9')
    expect(logger.warn).toHaveBeenCalled()
  })

  it('should return the ECUs untouched when there is no vehicle repository', async () => {
    const useCase = buildUseCase(undefined)

    const result = await useCase.execute(mockObdRepo([unknownEcu()]))

    expect(result[0].name).toBe('ECU 7E9')
  })
})
