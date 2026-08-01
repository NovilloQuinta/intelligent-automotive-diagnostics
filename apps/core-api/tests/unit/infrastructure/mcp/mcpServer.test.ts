import { describe, it, expect, vi } from 'vitest'
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import type { VehicleRepositoryPort } from '@/application/ports/vehicleRepository.port.js'
import type { FreezeFrame } from '@/domain/freezeFrame.js'
import type { PidDefinition } from '@/domain/pidDefinition.js'
import { Vin } from '@/domain/vin.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'

function mockObdRepo(overrides: Partial<ObdRepositoryPort> = {}): ObdRepositoryPort {
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
      vin: Vin.create('WAUZZZ8V5JA123456'),
    }),
    setPower: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function mockVehicleRepo(overrides: Partial<VehicleRepositoryPort> = {}): VehicleRepositoryPort {
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

const sampleFreezeFrame: FreezeFrame = {
  dtcCode: 'P0301',
  pidValues: { rpm: 3200, coolantTemp: 88, speed: 80 },
}

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

  describe('listTools', () => {
    it('should return 6 definitions with name, description and schema', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const tools = mcp.listTools()

      expect(tools).toHaveLength(6)
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

  describe('Edge cases', () => {
    it('should throw when calling unknown tool', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      expect(() => mcp.callTool('nonexistent_tool', {})).toThrow('Tool not found')
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
