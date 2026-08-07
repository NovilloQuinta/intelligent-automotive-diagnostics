import { describe, it, expect, vi } from 'vitest'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'

function mockObdRepo(overrides: Partial<ObdRepository> = {}): ObdRepository {
  return {
    readPid: vi.fn().mockResolvedValue(750),
    getSupportedPids: vi.fn().mockResolvedValue(['01 0C']),
    getFreezeFrame: vi.fn().mockResolvedValue(null),
    readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    clearDtcCodes: vi.fn().mockResolvedValue(undefined),
    readVin: vi.fn().mockResolvedValue('WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn().mockResolvedValue({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
      setPower: vi.fn().mockResolvedValue(undefined),
      getEcuInfo: vi.fn().mockResolvedValue([]),
      ...overrides,
  }
}

function mockVehicleRepo(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn(),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn(),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn(),
    findPidsByVehicle: vi.fn().mockResolvedValue([]),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    ...overrides,
  }
}

const sampleFreezeFrame: FreezeFrame = new FreezeFrame({
  dtcCode: 'P0301',
  pidValues: { rpm: 3200, coolantTemp: 88, speed: 80 },
})

const samplePids: PidDefinition[] = [
  {
    id: 1,
    vehicleId: 1,
    ecuId: 1,
    mode: '01',
    pidCode: '0C',
    name: 'Engine RPM',
    formula: '(A*256+B)/4',
    unit: 'rpm',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
  },
  {
    id: 2,
    vehicleId: 1,
    ecuId: 2,
    mode: '22',
    pidCode: '0300',
    name: 'TCU Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'manual',
  },
]

describe('McpServer', () => {
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
    it('get_available_pids should list all PIDs', async () => {
      const vRepo = mockVehicleRepo({ findPidsByVehicle: vi.fn().mockResolvedValue(samplePids) })
      const mcp = createMcpServer(mockObdRepo(), vRepo)

      const result = await mcp.callTool('get_available_pids', { vehicleId: 1 })

      expect(result.content[0].text).toContain('Engine RPM')
      expect(result.content[0].text).toContain('TCU Odometer')
    })

    it('get_available_pids should return empty message', async () => {
      const vRepo = mockVehicleRepo({ findPidsByVehicle: vi.fn().mockResolvedValue([]) })
      const mcp = createMcpServer(mockObdRepo(), vRepo)

      const result = await mcp.callTool('get_available_pids', { vehicleId: 1 })

      expect(result.content[0].text).toContain('No PIDs')
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

  describe('listTools', () => {
    it('should return 7 definitions with name, description and schema', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const tools = mcp.listTools()

      expect(tools).toHaveLength(7)
      for (const tool of tools) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.schema).toEqual(expect.objectContaining({ type: 'object' }))
      }
    })

    it('should expose exactly the registered tool names', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const names = mcp.listTools().map((t) => t.name)

      expect(names).toEqual([
        'read_pid',
        'get_dtc_codes',
        'get_freeze_frame',
        'read_vin',
        'get_vehicle_info',
        'get_available_pids',
        'get_ecu_info',
      ])
    })

    it('should describe read_pid schema with mode and pid properties', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const readPid = mcp.listTools().find((t) => t.name === 'read_pid')

      expect(readPid?.schema).toEqual({
        type: 'object',
        properties: { mode: { type: 'string' }, pid: { type: 'string' } },
        required: ['mode', 'pid'],
      })
    })

    it('should mark optional schema fields as not required', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const freezeFrame = mcp.listTools().find((t) => t.name === 'get_freeze_frame')

      expect(freezeFrame?.schema).toEqual({
        type: 'object',
        properties: { dtc: { type: 'string' } },
        required: [],
      })
    })
  })

  describe('isError propagation', () => {
    it('an empty result is not an error: no PIDs is a legitimate answer', async () => {
      const mcp = createMcpServer(mockObdRepo(), undefined)

      const result = await mcp.callTool('get_available_pids', { vehicleId: 1 })

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('No PIDs')
    })

    it('a throwing handler should also be reported as isError', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockRejectedValue(new Error('bus off')),
      })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_dtc_codes', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('bus off')
    })
  })

  describe('JSON Schema built with public Zod API', () => {
    it('should map string, number, boolean and optional without reading _def', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())
      const byName = Object.fromEntries(mcp.listTools().map((t) => [t.name, t.schema]))

      expect(byName.read_pid).toMatchObject({
        type: 'object',
        properties: { mode: { type: 'string' }, pid: { type: 'string' } },
        required: ['mode', 'pid'],
      })
      expect(byName.get_available_pids).toMatchObject({
        properties: { vehicleId: { type: 'number' } },
        required: [],
      })
      expect(byName.get_freeze_frame).toMatchObject({
        properties: { dtc: { type: 'string' } },
        required: [],
      })
    })
  })

  describe('Edge cases', () => {
    it('should reject with a typed ToolNotFoundError when calling unknown tool', async () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      // Rechaza, no lanza en sincrono: la firma promete una Promise y un throw
      // sincrono se escaparia de un llamante que use `.catch()`.
      await expect(mcp.callTool('nonexistent_tool', {})).rejects.toThrow(ToolNotFoundError)
    })

    it('ToolNotFoundError should carry the tool name as a field, not only in the message', async () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      await expect(mcp.callTool('nonexistent_tool', {})).rejects.toMatchObject({
        toolName: 'nonexistent_tool',
      })
    })

    it('get_dtc_codes should return message when no DTCs present', async () => {
      const repo = mockObdRepo({ readDtcCodes: vi.fn().mockResolvedValue([]) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_dtc_codes', {})

      expect(result.content[0].text).toBe('No DTC codes detected.')
    })

    it('get_freeze_frame should return message for unknown DTC', async () => {
      const repo = mockObdRepo({ getFreezeFrame: vi.fn().mockResolvedValue(null) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_freeze_frame', { dtc: 'INVALID' })

      expect(result.content[0].text).toContain('No freeze frame')
    })
  })
})
