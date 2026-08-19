import { describe, it, expect, vi } from 'vitest'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import { DiagnosisScenarioNotFoundError } from '@/infrastructure/services/errors.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { PidVectorRepository } from '@/application/ports/PidVectorRepository.js'
import type { DtcVectorRepository } from '@/application/ports/DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { EcuVectorRepository } from '@/application/ports/EcuVectorRepository.js'
import {
  createMockLogger,
  createMockObdRepo,
  createMockObdRepos,
  createMockVehicleRepo,
  mockScenarios,
} from './diagnosisServiceTestFactories.js'
import { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

/**
 * Catalogo de identidades para los tests de `getVehicleInfo`.
 *
 * El fabricante ya no sale de una tabla en `Vin`: es una consulta al catalogo,
 * asi que un servicio sin repositorio no puede resolverlo. Eso es el diseno, no
 * una regresion — la tabla en codigo dejaba `unknown` cualquier WMI no previsto.
 */
function repoWithIdentities(): VehicleRepository {
  const byWmi = new Map([
    ['WAU', 'Audi'],
    ['WP0', 'Porsche'],
  ])
  return createMockVehicleRepo({
    findVehicleIdentityByWmi: vi.fn(async (wmi: string) => {
      const manufacturer = byWmi.get(wmi)
      return manufacturer
        ? new VehicleIdentity({ id: 1, wmi, manufacturer, confidence: 0.9, source: 'seed' })
        : null
    }),
  })
}

describe('DiagnosisService — OBD, telemetria y passthrough MCP', () => {
  describe('listScenarios', () => {
    it('should return the constructor scenarios in simulation mode', () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const list = service.listScenarios()

      expect(list).toHaveLength(2)
      expect(list[0].id).toBe('audi-a3-idle')
    })

    it('should return the synthetic tcp scenario in TCP mode', () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo: createMockObdRepo(),
        logger: createMockLogger(),
      })

      const list = service.listScenarios()

      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({ id: 'tcp', name: 'ELM327 Direct Connection' })
    })
  })

  describe('diagnose', () => {
    it('should run a full diagnosis for an existing simulation scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.diagnose('audi-a3-idle')

      expect(result.parsedValues.rpm).toBe(750)
      expect(result.parsedValues.coolantTemp).toBe(90)
      expect(result.dtcCodes).toHaveLength(1)
      expect(result.dtcCodes[0].code).toBe('P0301')
      expect(result.severity).toBe('high')
      expect(result.diagnosisText).toContain('[HIGH] P0301')
      expect(result.rawData).toContain('750')
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.diagnose('nonexistent')).rejects.toThrow(DiagnosisScenarioNotFoundError)
    })

    it('should use the injected obdRepo directly in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.diagnose()

      expect(result.parsedValues.rpm).toBe(800)
      expect(result.parsedValues.coolantTemp).toBe(90)
      expect(result.dtcCodes).toEqual([{ code: 'P0301', description: '' }])
      expect(result.severity).toBe('high')
    })
  })

  describe('getLiveData', () => {
    it('should use readPids for a custom PID list and map to named fields', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 800],
          ['0D', 90],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result).toEqual({
        rpm: 800,
        speed: 90,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 90 },
        ],
      })
      expect(repo.readPids).toHaveBeenCalledWith('01', ['0C', '0D'])
      expect(repo.readPid).not.toHaveBeenCalled()
    })

    it('should default to the 4 dashboard PIDs when no list is provided', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 750],
          ['05', 90],
          ['0D', 0],
          ['0F', 25],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle')

      expect(result).toEqual({
        rpm: 750,
        coolantTemp: 90,
        speed: 0,
        intakeTemp: 25,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 750 },
          { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C', value: 90 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 0 },
          { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', value: 25 },
        ],
      })
      expect(repo.readPids).toHaveBeenCalledWith('01', ['0C', '05', '0D', '0F'])
    })

    it('should set null for a requested PID that readPids omits', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(new Map([['0C', 800]]))
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result).toEqual({
        rpm: 800,
        speed: null,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: null },
        ],
      })
    })

    it('should return generic readings for PIDs without a dedicated gauge', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['11', 14],
          ['42', 14.2],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['11', '42'])

      expect(result).toEqual({
        readings: [
          { code: '01 11', name: 'Throttle Position', unit: '%', value: 14 },
          { code: '01 42', name: 'Control Module Voltage', unit: 'V', value: 14.2 },
        ],
      })
    })

    it('should return the 4 named fields plus readings of the default PIDs', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(
        new Map([
          ['0C', 750],
          ['05', 90],
          ['0D', 0],
          ['0F', 25],
        ]),
      )
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle')

      expect(result).toEqual({
        rpm: 750,
        coolantTemp: 90,
        speed: 0,
        intakeTemp: 25,
        readings: [
          { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 750 },
          { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C', value: 90 },
          { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: 0 },
          { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', value: 25 },
        ],
      })
    })

    it('should emit a reading with null value for a PID that readPids omits', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      vi.mocked(repo.readPids).mockResolvedValue(new Map([['0C', 800]]))
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getLiveData('audi-a3-idle', ['0C', '0D'])

      expect(result.readings).toEqual([
        { code: '01 0C', name: 'Engine RPM', unit: 'rpm', value: 800 },
        { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h', value: null },
      ])
    })
  })

  describe('listAvailablePids', () => {
    it('returns the 16 Mode 01 PIDs with name and unit, without touching the repository', () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const pids = service.listAvailablePids()

      expect(pids).toHaveLength(16)
      expect(pids).toContainEqual({ code: '01 0C', name: 'Engine RPM', unit: 'rpm' })
      expect(pids).toContainEqual({ code: '01 05', name: 'Engine Coolant Temperature', unit: '°C' })
      expect(pids).toContainEqual({ code: '01 42', name: 'Control Module Voltage', unit: 'V' })
      expect(repo.readPid).not.toHaveBeenCalled()
      expect(repo.getSupportedPids).not.toHaveBeenCalled()
    })
  })

  describe('getFreezeFrame', () => {
    it('should delegate to the repository getFreezeFrame with the dtc in TCP mode', async () => {
      const frame = new FreezeFrame({ dtcCode: 'P0301', pidValues: { rpm: 750 } })
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getFreezeFrame).mockResolvedValue(frame)
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getFreezeFrame(undefined, 'P0301')

      expect(result).toEqual(frame)
      expect(obdRepo.getFreezeFrame).toHaveBeenCalledWith('P0301')
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.getFreezeFrame('audi-a3-idle', 'P0301')

      expect(result).toBeNull()
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getFreezeFrame('no-existe', 'P0301')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('getEcuInfo', () => {
    it('should return structured EcuInfo[] from a scenario', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const service = new DiagnosisService({
        scenarios: [{ ...mockScenarios[0], ecus: [ecu] }],
        obdRepos: new Map([['audi-a3-idle', createMockObdRepo({ ecus: [ecu] })]]),
        logger: createMockLogger(),
      })

      const result = await service.getEcuInfo('audi-a3-idle')

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Engine Control Unit')
      expect(result[0].requestAddr).toBe('7E0')
    })

    it('should return ECUs from obdRepo in TCP mode without scenarioId', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getEcuInfo as ReturnType<typeof vi.fn>).mockResolvedValue([ecu])
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getEcuInfo()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Engine Control Unit')
    })

    it('should throw DiagnosisScenarioNotFoundError for unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getEcuInfo('no-existe')).rejects.toThrow(DiagnosisScenarioNotFoundError)
    })

    /**
     * Persistencia de lo descubierto.
     *
     * El barrido pintaba el mapa y no dejaba rastro: `ecus` se quedaba a cero por
     * mucho que se escanease desde la UI, porque la unica llamada a `persistEcus`
     * colgaba del `sessionContext` que arma el runner cognitivo. Sin clave de LLM,
     * ese camino no corre nunca.
     */
    describe('persistencia de las ECUs descubiertas', () => {
      const descubierta = (responseAddr: string, requestAddr: string): EcuInfo =>
        new EcuInfo({
          id: 0,
          vehicleId: 0,
          name: `ECU ${responseAddr}`,
          requestAddr,
          responseAddr,
          type: 'UNKNOWN',
          protocol: 'CAN_11_500',
        })

      it('guarda las ECUs nuevas contra el vehiculo identificado', async () => {
        const vehicleRepo = createMockVehicleRepo({
          upsertVehicle: vi.fn().mockResolvedValue({ id: 7 }),
        })
        const ecus = [descubierta('7E8', '7E0'), descubierta('7E9', '7E1')]
        const service = new DiagnosisService({
          scenarios: mockScenarios,
          obdRepos: new Map([['audi-a3-idle', createMockObdRepo({ ecus })]]),
          vehicleRepo,
          logger: createMockLogger(),
        })

        await service.getEcuInfo('audi-a3-idle')
        await vi.waitFor(() => expect(vehicleRepo.insertEcu).toHaveBeenCalledTimes(2))

        const guardadas = vi
          .mocked(vehicleRepo.insertEcu as ReturnType<typeof vi.fn>)
          .mock.calls.map(([ecu]) => (ecu as EcuInfo).responseAddr)
        expect(guardadas.sort()).toEqual(['7E8', '7E9'])
        expect(
          vi.mocked(vehicleRepo.insertEcu as ReturnType<typeof vi.fn>).mock.calls[0][0].vehicleId,
        ).toBe(7)
      })

      it('refresca la fecha en vez de duplicar cuando la ECU ya estaba', async () => {
        const vehicleRepo = createMockVehicleRepo({
          upsertVehicle: vi.fn().mockResolvedValue({ id: 7 }),
          findEcuByAddress: vi.fn().mockResolvedValue({ id: 42 }),
        })
        const service = new DiagnosisService({
          scenarios: mockScenarios,
          obdRepos: new Map([
            ['audi-a3-idle', createMockObdRepo({ ecus: [descubierta('7E8', '7E0')] })],
          ]),
          vehicleRepo,
          logger: createMockLogger(),
        })

        await service.getEcuInfo('audi-a3-idle')
        await vi.waitFor(() => expect(vehicleRepo.updateEcuDiscoveredAt).toHaveBeenCalledWith(42))

        expect(vehicleRepo.insertEcu).not.toHaveBeenCalled()
      })

      it('devuelve las ECUs aunque la escritura falle: descubrir no depende de guardar', async () => {
        const vehicleRepo = createMockVehicleRepo({
          upsertVehicle: vi.fn().mockRejectedValue(new Error('disco lleno')),
        })
        const service = new DiagnosisService({
          scenarios: mockScenarios,
          obdRepos: new Map([
            ['audi-a3-idle', createMockObdRepo({ ecus: [descubierta('7E8', '7E0')] })],
          ]),
          vehicleRepo,
          logger: createMockLogger(),
        })

        const result = await service.getEcuInfo('audi-a3-idle')

        expect(result).toHaveLength(1)
        expect(vehicleRepo.insertEcu).not.toHaveBeenCalled()
      })

      it('no intenta guardar si no hay repositorio', async () => {
        const service = new DiagnosisService({
          scenarios: mockScenarios,
          obdRepos: new Map([
            ['audi-a3-idle', createMockObdRepo({ ecus: [descubierta('7E8', '7E0')] })],
          ]),
          logger: createMockLogger(),
        })

        await expect(service.getEcuInfo('audi-a3-idle')).resolves.toHaveLength(1)
      })
    })
  })

  describe('getVehicleInfo', () => {
    it('should return the vehicle data of a scenario decorated with the decoded VIN fields', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
        vehicleRepo: repoWithIdentities(),
      })

      const result = await service.getVehicleInfo('audi-a3-idle')

      expect(result).toEqual({
        vin: 'WAUZZZ8V5JA123456',
        make: 'Audi',
        model: 'A3',
        year: 2018,
        engineType: '2.0 TFSI',
        manufacturer: 'Audi',
        region: { country: 'Germany', region: 'Europe' },
        modelYearDecoded: 2018,
        vinStatus: 'read',
      })
    })

    it('should merge descriptor data with VIN from ECU, keeping VIN from ECU always', async () => {
      const repos = createMockObdRepos()
      // Mock the repo to return a different VIN than the descriptor
      vi.mocked(
        repos.get('audi-a3-idle')!.getVehicleInfo as ReturnType<typeof vi.fn>,
      ).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin('WP0ZZZ99ZTS390000'),
      })

      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
        vehicleRepo: repoWithIdentities(),
      })

      const result = await service.getVehicleInfo('audi-a3-idle')

      // VIN siempre del ECU, metadatos del descriptor
      expect(result.vin).toBe('WP0ZZZ99ZTS390000')
      expect(result.make).toBe('Audi')
      expect(result.model).toBe('A3')
      expect(result.year).toBe(2018)
      expect(result.engineType).toBe('2.0 TFSI')
      // Decodificacion del VIN real (Porsche WMI)
      expect(result.manufacturer).toBe('Porsche')
    })

    it('should return the vehicle data from obdRepo in TCP mode without scenarioId', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
        vehicleRepo: repoWithIdentities(),
      })

      const result = await service.getVehicleInfo()

      expect(result.vin).toBe('WAUZZZ8V5JA123456')
      expect(result.manufacturer).toBe('Audi')
      expect(result.vinStatus).toBe('read')
    })

    it('should null the decoded fields for FALLBACK_VIN without throwing', async () => {
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getVehicleInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin(FALLBACK_VIN),
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo()

      expect(result).toEqual({
        vin: FALLBACK_VIN,
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        manufacturer: null,
        region: null,
        modelYearDecoded: null,
        vinStatus: 'unreadable',
      })
    })

    it('should null the decoded fields when the VIN is not decodable without throwing', async () => {
      const obdRepo = createMockObdRepo()
      vi.mocked(obdRepo.getVehicleInfo as ReturnType<typeof vi.fn>).mockResolvedValue({
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: 'NO-ES-UN-VIN',
      })
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleInfo()

      expect(result.vin).toBe('NO-ES-UN-VIN')
      expect(result.manufacturer).toBeNull()
      expect(result.region).toBeNull()
      expect(result.modelYearDecoded).toBeNull()
      expect(result.vinStatus).toBe('read')
    })

    it('should throw DiagnosisScenarioNotFoundError for unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getVehicleInfo('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('clearDtcCodes', () => {
    it('should delegate to the repository clearDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      await service.clearDtcCodes()

      expect(obdRepo.clearDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      await service.clearDtcCodes('audi-a3-idle')

      expect(repo.clearDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.clearDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('readPendingDtcCodes', () => {
    it('should delegate to the repository readPendingDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.readPendingDtcCodes()

      expect(result).toEqual([{ code: 'P0301', description: 'Cylinder 1 Misfire' }])
      expect(obdRepo.readPendingDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.readPendingDtcCodes('audi-a3-idle')

      expect(result).toEqual([{ code: 'P0301', description: 'Cylinder 1 Misfire' }])
      expect(repo.readPendingDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.readPendingDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('readPermanentDtcCodes', () => {
    it('should delegate to the repository readPermanentDtcCodes in TCP mode', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.readPermanentDtcCodes()

      expect(result).toEqual([{ code: 'P0401', description: 'EGR Flow Insufficient' }])
      expect(obdRepo.readPermanentDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should resolve the scenario repository and delegate in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.readPermanentDtcCodes('audi-a3-idle')

      expect(result).toEqual([{ code: 'P0401', description: 'EGR Flow Insufficient' }])
      expect(repo.readPermanentDtcCodes).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.readPermanentDtcCodes('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })

  describe('callMcpTool', () => {
    it('should call the MCP tool and return its text result', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      const result = await service.callMcpTool('read_pid', 'audi-a3-idle', {
        mode: '01',
        pid: '0C',
      })

      expect(result).toBe('750')
    })

    it('should throw when the tool does not exist', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.callMcpTool('bogus_tool', 'audi-a3-idle')).rejects.toThrow(
        'Tool not found: bogus_tool',
      )
    })

    it('should call a knowledge MCP tool when knowledgeStack is present', async () => {
      const diagnosisIndex: DiagnosisVectorRepository = {
        search: vi.fn().mockResolvedValue([]),
        index: vi.fn().mockResolvedValue(undefined),
      }
      const pidsIndex: PidVectorRepository = {
        index: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
      } as unknown as PidVectorRepository
      const dtcsIndex = { index: vi.fn(), search: vi.fn() } as unknown as DtcVectorRepository
      const ecusIndex = { index: vi.fn(), search: vi.fn() } as unknown as EcuVectorRepository
      const knowledgeStack: KnowledgeStack = { pidsIndex, dtcsIndex, diagnosisIndex, ecusIndex }
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
        knowledgeStack,
      })

      const result = await service.callMcpTool('search_similar_pids', 'audi-a3-idle', {
        query: 'battery',
      })

      expect(pidsIndex.search).toHaveBeenCalledWith('battery', expect.anything())
      expect(result).toContain('No PIDs')
    })
  })

  describe('getVehicleStatus', () => {
    it('should delegate to the repository getVehicleStatus in simulation mode', async () => {
      const repos = createMockObdRepos()
      const repo = repos.get('audi-a3-idle')!
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: repos,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleStatus('audi-a3-idle')

      expect(result).toBeInstanceOf(VehicleStatus)
      expect(repo.getVehicleStatus).toHaveBeenCalledTimes(1)
    })

    it('should delegate to obdRepo in TCP mode without scenarioId', async () => {
      const obdRepo = createMockObdRepo()
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        obdRepo,
        logger: createMockLogger(),
      })

      const result = await service.getVehicleStatus()

      expect(result).toBeInstanceOf(VehicleStatus)
      expect(obdRepo.getVehicleStatus).toHaveBeenCalledTimes(1)
    })

    it('should throw DiagnosisScenarioNotFoundError for an unknown scenario', async () => {
      const service = new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: createMockObdRepos(),
        logger: createMockLogger(),
      })

      await expect(service.getVehicleStatus('no-existe')).rejects.toThrow(
        DiagnosisScenarioNotFoundError,
      )
    })
  })
})
