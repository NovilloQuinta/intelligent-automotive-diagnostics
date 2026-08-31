import { describe, it, expect, vi } from 'vitest'
import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { PidDefinition } from '@/domain/entities/PidDefinition.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import {
  mockObdRepo,
  mockVehicleRepo,
  sampleFreezeFrame,
  samplePids,
  sampleMode22Pids,
} from './mcpTestFactories.js'

describe('diagnosticTools (via createMcpServer)', () => {
  describe('Cap 1 — ObdRepository tools', () => {
    it('read_pid tool should delegate to ObdRepository', async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(750) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      expect(repo.readPid).toHaveBeenCalledWith('01', '0C')
      expect(result.content[0].text).toBe('750')
    })

    it('get_dtc_codes tool should return DTC list', async () => {
      const repo = mockObdRepo()
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_dtc_codes', {})

      expect(repo.readDtcCodes).toHaveBeenCalledOnce()
      expect(result.content[0].text).toContain('P0301')
    })

    it('get_freeze_frame tool should return "No freeze frame" when null', async () => {
      const repo = mockObdRepo({ getFreezeFrame: vi.fn().mockResolvedValue(null) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_freeze_frame', {})

      expect(repo.getFreezeFrame).toHaveBeenCalledWith(undefined)
      expect(result.content[0].text).toContain('No freeze frame')
    })

    it('get_freeze_frame tool should return sensor values when present', async () => {
      const repo = mockObdRepo({ getFreezeFrame: vi.fn().mockResolvedValue(sampleFreezeFrame) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_freeze_frame', { dtc: 'P0301' })

      expect(repo.getFreezeFrame).toHaveBeenCalledWith('P0301')
      expect(result.content[0].text).toContain('3200')
    })

    it('read_vin tool should return VIN', async () => {
      const repo = mockObdRepo()
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('read_vin', {})

      expect(repo.readVin).toHaveBeenCalledOnce()
      expect(result.content[0].text).toBe('WAUZZZ8V5JA123456')
    })

    it('get_vehicle_info should return make and model', async () => {
      const repo = mockObdRepo()
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_vehicle_info', {})

      expect(repo.getVehicleInfo).toHaveBeenCalledOnce()
      expect(result.content[0].text).toContain('Audi')
    })
  })

  describe('Cap 2 — VehicleRepository tools', () => {
    it('get_available_pids should list manufacturer/model catalog PIDs', async () => {
      const vRepo = mockVehicleRepo({
        findPidsByManufacturerModel: vi.fn().mockResolvedValue(samplePids),
      })
      const ctx = { manufacturer: 'Audi', model: 'A3' }
      const mcp = createMcpServer(mockObdRepo(), vRepo, undefined, undefined, ctx)

      const result = await mcp.callTool('get_available_pids', {})

      expect(vRepo.findPidsByManufacturerModel).toHaveBeenCalledWith('Audi', 'A3')
      expect(result.content[0].text).toContain('Engine RPM')
      expect(result.content[0].text).toContain('TCU Odometer')
    })

    it('get_available_pids should return Mode 01 scan + Mode 22 catalog', async () => {
      const vRepo = mockVehicleRepo({
        findPidsByMode: vi.fn().mockResolvedValue(sampleMode22Pids),
      })
      const mcp = createMcpServer(mockObdRepo(), vRepo)

      const result = await mcp.callTool('get_available_pids', {})

      expect(vRepo.findPidsByMode).toHaveBeenCalledWith('22')
      expect(result.content[0].text).toContain('01 0C')
      expect(result.content[0].text).toContain('TCU Odometer')
      expect(result.content[0].text).toContain('ECM Odometer')
    })
  })

  describe('get_ecu_info tool', () => {
    it('should return narrative text with ECU name, addresses and protocol', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_ecu_info', {})

      expect(repo.getEcuInfo).toHaveBeenCalledOnce()
      expect(result.content[0].text).toContain('Engine Control Unit')
      expect(result.content[0].text).toContain('7E0')
      expect(result.content[0].text).toContain('7E8')
      expect(result.content[0].text).toContain('ECM')
    })

    it('should return "No ECUs discovered" when empty', async () => {
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([]) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_ecu_info', {})

      expect(result.content[0].text).toBe('No ECUs discovered.')
    })

    it('should mark no-params schema correctly', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const tool = mcp.listTools().find((t) => t.name === 'get_ecu_info')

      expect(tool?.schema).toEqual({
        type: 'object',
        properties: {},
        required: [],
      })
    })
  })

  describe('SessionContext — persistence wire-up', () => {
    const sessionContext = { sessionId: 1, vehicleId: 42 }

    it('createMcpServer accepts optional sessionContext as 5th parameter', () => {
      const repo = mockObdRepo()
      const vRepo = mockVehicleRepo()

      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      expect(mcp).toBeDefined()
      expect(mcp.listTools()).toHaveLength(7)
    })

    it('createMcpServer works without sessionContext (backward compat)', () => {
      const repo = mockObdRepo()
      const vRepo = mockVehicleRepo()

      const mcp = createMcpServer(repo, vRepo, undefined, undefined)

      expect(mcp).toBeDefined()
      expect(mcp.listTools()).toHaveLength(7)
    })

    it('handleReadPid persists reading when sessionContext has sessionId', async () => {
      const repo = mockObdRepo({
        readPid: vi.fn().mockResolvedValue(750),
        readPidRaw: vi.fn().mockResolvedValue([0x0b, 0xb8]),
      })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockResolvedValue({
          id: 99,
          dataBytes: 2,
        } as PidDefinition),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.findPidDefinition).toHaveBeenCalledWith('01', '0C')
      expect(vRepo.insertPidReading).toHaveBeenCalledTimes(1)
      const reading = (vRepo.insertPidReading as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(reading.mode).toBe('01')
      expect(reading.pidCode).toBe('0C')
      expect(reading.sessionId).toBe(1)
      expect(reading.pidDefId).toBe(99)
      expect(reading.parsedValue).toBe(750)
      expect(reading.rawHex).toBe('0BB8')
    })

    it('handleReadPid persists reading with pidDefId undefined when definition not found', async () => {
      const repo = mockObdRepo({
        readPid: vi.fn().mockResolvedValue(750),
        readPidRaw: vi.fn().mockResolvedValue([0x0b, 0xb8]),
      })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockResolvedValue(null),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertPidReading).toHaveBeenCalledTimes(1)
      const reading = (vRepo.insertPidReading as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(reading.mode).toBe('01')
      expect(reading.pidCode).toBe('0C')
      expect(reading.sessionId).toBe(1)
      expect(reading.pidDefId).toBeUndefined()
    })

    it('handleReadPid does not persist reading without sessionContext', async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(750) })
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(repo, vRepo, undefined, undefined)

      await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertPidReading).not.toHaveBeenCalled()
    })

    it('handleReadPid does not persist reading when sessionContext has no sessionId', async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(750) })
      const vRepo = mockVehicleRepo()
      const ctx = { vehicleId: 42 }
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ctx)

      await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertPidReading).not.toHaveBeenCalled()
    })

    it('handleReadPid degrades gracefully when persistPidReading fails', async () => {
      const repo = mockObdRepo({
        readPid: vi.fn().mockResolvedValue(750),
        readPidRaw: vi.fn().mockRejectedValue(new Error('readPidRaw failed')),
      })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockRejectedValue(new Error('DB down')),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      // Should NOT throw — the tool call itself must succeed
      const result = await mcp.callTool('read_pid', { mode: '01', pid: '0C' })

      expect(result.content[0].text).toBe('750')
      expect(result.isError).toBeFalsy()
    })

    it('handleGetEcuInfo persists ECUs when sessionContext has vehicleId', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      await mcp.callTool('get_ecu_info', {})

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertEcu).toHaveBeenCalledTimes(1)
      const persistedEcu = (vRepo.insertEcu as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(persistedEcu.vehicleId).toBe(42)
      expect(persistedEcu.name).toBe('Engine Control Unit')
      expect(persistedEcu.requestAddr).toBe('7E0')
    })

    it('handleGetEcuInfo does not persist ECUs without vehicleId', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECM',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo()
      const ctx = { sessionId: 1 } // no vehicleId
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ctx)

      await mcp.callTool('get_ecu_info', {})

      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertEcu).not.toHaveBeenCalled()
    })

    it('handleGetEcuInfo degrades gracefully when persistEcus fails', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECM',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo({
        insertEcu: vi.fn().mockRejectedValue(new Error('DB down')),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, sessionContext)

      // Should NOT throw
      const result = await mcp.callTool('get_ecu_info', {})

      expect(result.content[0].text).toContain('ECM')
      expect(result.isError).toBeFalsy()
    })
  })

  describe('Task 11.1 — DTC persistence in handleGetDtcCodes', () => {
    const dtcSessionCtx = {
      sessionId: 1,
      vehicleId: 42,
      manufacturer: 'Audi',
      model: 'A3',
    }

    it('persists DTCs when sessionContext has manufacturer/model', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockResolvedValue([
          { code: 'P0301', description: 'Cylinder 1 Misfire' },
          { code: 'P0401', description: 'EGR Flow Insufficient' },
        ]),
      })
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, dtcSessionCtx)

      await mcp.callTool('get_dtc_codes', {})

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.upsertDtcDefinition).toHaveBeenCalledTimes(2)
      expect(vRepo.upsertDtcDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          manufacturer: 'Audi',
          model: 'A3',
          code: 'P0301',
          description: 'Cylinder 1 Misfire',
          confidence: 0.5,
          source: 'auto',
        }),
      )
      expect(vRepo.upsertDtcDefinition).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'P0401',
        }),
      )
    })

    it('does not persist DTCs without manufacturer/model in sessionContext', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P0301', description: 'Misfire' }]),
      })
      const vRepo = mockVehicleRepo()
      // sessionContext with only sessionId/vehicleId, no manufacturer/model
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, {
        sessionId: 1,
        vehicleId: 42,
        manufacturer: '',
        model: '',
      })

      await mcp.callTool('get_dtc_codes', {})

      await new Promise((resolve) => setTimeout(resolve, 10))

      // Should NOT persist because manufacturer/model are empty/falsy
      expect(vRepo.upsertDtcDefinition).not.toHaveBeenCalled()
    })
  })

  describe('Task 11.2 — ECU dedup in persistEcus', () => {
    const ecuSessionCtx = { sessionId: 1, vehicleId: 42 }

    it('updates discoveredAt for existing ECU instead of inserting', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const existingEcu = new EcuInfo({
        id: 5,
        vehicleId: 42,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo({
        findEcuByAddress: vi.fn().mockResolvedValue(existingEcu),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ecuSessionCtx)

      await mcp.callTool('get_ecu_info', {})

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.findEcuByAddress).toHaveBeenCalledWith(42, '7E0', '7E8')
      expect(vRepo.updateEcuDiscoveredAt).toHaveBeenCalledWith(5)
      expect(vRepo.insertEcu).not.toHaveBeenCalled()
    })

    it('inserts new ECU when findEcuByAddress returns null', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo({
        findEcuByAddress: vi.fn().mockResolvedValue(null),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ecuSessionCtx)

      await mcp.callTool('get_ecu_info', {})

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.findEcuByAddress).toHaveBeenCalledWith(42, '7E0', '7E8')
      expect(vRepo.insertEcu).toHaveBeenCalledTimes(1)
      expect(vRepo.updateEcuDiscoveredAt).not.toHaveBeenCalled()
    })
  })

  describe('Task 12.2 — PID dedup with manufacturer/model', () => {
    it('autoRegisterPid uses manufacturer/model when available', async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(750) })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockResolvedValue(null),
      })
      const ctx = {
        sessionId: 1,
        vehicleId: 42,
        manufacturer: 'Audi',
        model: 'A3',
      }
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ctx)

      await mcp.callTool('read_pid', { mode: '22', pid: '0300' })

      // Flush fire-and-forget microtasks
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.findPidDefinition).toHaveBeenCalledWith('22', '0300', 'Audi', 'A3')
      expect(vRepo.insertPidDefinition).toHaveBeenCalledTimes(1)
      const inserted = (vRepo.insertPidDefinition as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(inserted.manufacturer).toBe('Audi')
      expect(inserted.model).toBe('A3')
    })

    it("never auto-registers a Mode 22 PID without manufacturer/model: it would pollute every vehicle's catalog", async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(5) })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockResolvedValue(null),
      })
      // Sin sessionContext: read_pid antes de resolver el vehiculo, o callMcpTool directo.
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, undefined)

      await mcp.callTool('read_pid', { mode: '22', pid: '0300' })
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.findPidDefinition).not.toHaveBeenCalled()
      expect(vRepo.insertPidDefinition).not.toHaveBeenCalled()
    })

    it('never auto-registers when only manufacturer is known but not the model', async () => {
      const repo = mockObdRepo({ readPid: vi.fn().mockResolvedValue(5) })
      const vRepo = mockVehicleRepo({
        findPidDefinition: vi.fn().mockResolvedValue(null),
      })
      // sessionId presente a proposito: dispara tambien persistPidReading (aparte, legitimo).
      const ctx = { sessionId: 1, vehicleId: 42, manufacturer: 'Audi', model: undefined }
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ctx)

      await mcp.callTool('read_pid', { mode: '22', pid: '0300' })
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(vRepo.insertPidDefinition).not.toHaveBeenCalled()
    })
  })

  describe('Section 8 — get_ecu_info resolution against ecu_definitions', () => {
    const ecuCatalogCtx = {
      sessionId: 1,
      vehicleId: 42,
      manufacturer: 'Audi',
      model: 'A3',
    }

    it('8.1 resolves an UNKNOWN ECU to its real name/type from the catalog', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECU 7E9',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'UNKNOWN',
        protocol: 'CAN_11_500',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo({
        findEcuDefinitionByAddress: vi.fn().mockResolvedValue({
          id: 9,
          manufacturer: 'Audi',
          model: 'A3',
          responseAddr: '7E9',
          requestAddr: '7E1',
          name: 'Transmission Control Module',
          type: 'TCM',
          confidence: 0.8,
          source: 'mechanic',
        }),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ecuCatalogCtx)

      const result = await mcp.callTool('get_ecu_info', {})

      expect(result.content[0].text).toContain('Transmission Control Module')
      expect(result.content[0].text).toContain('TCM')
      expect(vRepo.findEcuDefinitionByAddress).toHaveBeenCalledWith('Audi', 'A3', '7E9')

      await new Promise((resolve) => setTimeout(resolve, 10))
      const persisted = (vRepo.insertEcu as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(persisted.name).toBe('Transmission Control Module')
      expect(persisted.type).toBe('TCM')
    })

    it('8.2 keeps UNKNOWN when no manufacturer/model in sessionContext', async () => {
      const ecu = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECU 7E9',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'UNKNOWN',
        protocol: 'CAN_11_500',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecu]) })
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, {
        sessionId: 1,
        vehicleId: 42,
      })

      const result = await mcp.callTool('get_ecu_info', {})

      expect(result.content[0].text).toContain('ECU 7E9')
      expect(vRepo.findEcuDefinitionByAddress).not.toHaveBeenCalled()
    })

    it('8.3 dedupes UNKNOWN response addresses before catalog lookup', async () => {
      const ecuA = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECU 7E9',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'UNKNOWN',
        protocol: 'CAN_11_500',
      })
      const ecuB = new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'ECU 7E9',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'UNKNOWN',
        protocol: 'CAN_11_500',
      })
      const repo = mockObdRepo({ getEcuInfo: vi.fn().mockResolvedValue([ecuA, ecuB]) })
      const vRepo = mockVehicleRepo({
        findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
      })
      const mcp = createMcpServer(repo, vRepo, undefined, undefined, ecuCatalogCtx)

      await mcp.callTool('get_ecu_info', {})

      expect(vRepo.findEcuDefinitionByAddress).toHaveBeenCalledTimes(1)
      expect(vRepo.findEcuDefinitionByAddress).toHaveBeenCalledWith('Audi', 'A3', '7E9')
    })
  })
})
