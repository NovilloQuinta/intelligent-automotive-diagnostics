import { describe, it, expect, vi } from 'vitest'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { PidVectorRepository } from '@/application/ports/PidVectorRepository.js'
import type { DtcVectorRepository } from '@/application/ports/DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { EcuVectorRepository } from '@/application/ports/EcuVectorRepository.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { EcuKnowledgeEntry } from '@/application/dto/knowledge/EcuKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

function mockObdRepo(overrides: Partial<ObdRepository> = {}): ObdRepository {
  return {
    readPid: vi.fn().mockResolvedValue(750),
    readPidRaw: vi.fn().mockResolvedValue([0x0b, 0xb8]),
    getSupportedPids: vi.fn().mockResolvedValue(['01 0C']),
    getFreezeFrame: vi.fn().mockResolvedValue(null),
    readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    clearDtcCodes: vi.fn().mockResolvedValue(undefined),
    readPendingDtcCodes: vi
      .fn()
      .mockResolvedValue([{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    readPermanentDtcCodes: vi
      .fn()
      .mockResolvedValue([{ code: 'P0401', description: 'EGR Flow Insufficient' }]),
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
    findPidsByManufacturerModel: vi.fn().mockResolvedValue([]),
    findPidsByMode: vi.fn().mockResolvedValue([]),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    findDtcDefinition: vi.fn().mockResolvedValue(null),
    upsertDtcDefinition: vi.fn(),
    findDtcDefinitionByCode: vi.fn().mockResolvedValue(null),
    findEcuByAddress: vi.fn().mockResolvedValue(null),
    updateEcuDiscoveredAt: vi.fn(),
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    upsertEcuDefinition: vi.fn(),
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
    pidCode: new PidCode('01', '0C'),
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
    pidCode: new PidCode('22', '0300'),
    name: 'TCU Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'manual',
  },
]

const sampleMode22Pids: PidDefinition[] = [
  {
    id: 3,
    pidCode: new PidCode('22', '0300'),
    name: 'TCU Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'seed',
    manufacturer: 'Toyota',
    model: 'Auris Hybrid',
  },
  {
    id: 4,
    pidCode: new PidCode('22', '0400'),
    name: 'ECM Odometer',
    formula: '(A<<24|B<<16|C<<8|D)/10',
    unit: 'km',
    dataBytes: 4,
    pidType: 'formula',
    confidence: 0.9,
    source: 'seed',
    manufacturer: 'Toyota',
    model: 'Auris Hybrid',
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
    it('an empty result is not an error: PIDs with catalog fallback is legitimate', async () => {
      const mcp = createMcpServer(mockObdRepo(), undefined)

      const result = await mcp.callTool('get_available_pids', {})

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('01 0C')
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
        properties: {},
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

  // ─── Knowledge tools ─────────────────────────────────────────────────────

  const pidEntry: PidKnowledgeEntry = {
    id: 'pid-001',
    embeddedText: 'Toyota Auris Hybrid battery temperature PID',
    manufacturer: 'Toyota',
    model: 'Auris',
    confidence: 0.8,
    source: KnowledgeSource.Mechanic,
    validated: true,
  }

  const dtcEntry: DtcKnowledgeEntry = {
    id: 'dtc-001',
    embeddedText: 'Toyota Auris Hybrid battery overheat DTC',
    manufacturer: 'Toyota',
    model: 'Auris',
    confidence: 0.7,
    source: KnowledgeSource.Web,
    validated: true,
  }

  const diagEntry: DiagnosisKnowledgeEntry = {
    id: 'diag-001',
    embeddedText: 'Toyota Auris Hybrid: loss of power due to battery degradation',
    manufacturer: 'Toyota',
    model: 'Auris',
    symptoms: ['loss of power', 'battery warning'],
    pidsInvolved: ['01 0C'],
    confidence: 0.5,
    source: KnowledgeSource.PreviousDiagnosis,
  }

  const ecuEntry: EcuKnowledgeEntry = {
    id: 'ecu-001',
    embeddedText: 'Audi A3 transmission control module at response address 7E9',
    manufacturer: 'Audi',
    model: 'A3',
    responseAddr: '7E9',
    requestAddr: '7E1',
    name: 'Transmission Control Module',
    type: 'TCM',
    system: 'Transmission',
    confidence: 0.8,
    source: KnowledgeSource.Mechanic,
  }

  function mockKnowledgeStack(
    overrides: Partial<{
      pidsIndex: Partial<PidVectorRepository>
      dtcsIndex: Partial<DtcVectorRepository>
      diagnosisIndex: Partial<DiagnosisVectorRepository>
      ecusIndex: Partial<EcuVectorRepository>
    }> = {},
  ): KnowledgeStack {
    return {
      pidsIndex: {
        index: vi.fn<[PidKnowledgeEntry], Promise<void>>().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ entry: pidEntry, distance: 0.12 }]),
        ...overrides.pidsIndex,
      } as PidVectorRepository,
      dtcsIndex: {
        index: vi.fn<[DtcKnowledgeEntry], Promise<void>>().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ entry: dtcEntry, distance: 0.23 }]),
        ...overrides.dtcsIndex,
      } as DtcVectorRepository,
      diagnosisIndex: {
        index: vi.fn<[DiagnosisKnowledgeEntry], Promise<void>>().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ entry: diagEntry, distance: 0.34 }]),
        ...overrides.diagnosisIndex,
      } as DiagnosisVectorRepository,
      ecusIndex: {
        index: vi.fn<[EcuKnowledgeEntry], Promise<void>>().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([{ entry: ecuEntry, distance: 0.45 }]),
        ...overrides.ecusIndex,
      } as EcuVectorRepository,
    }
  }

  describe('Section 2 — Conditional knowledge tool registration', () => {
    it('2.1 createMcpServer with knowledgeStack registers 8 knowledge tools', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), mockKnowledgeStack())

      const names = mcp.listTools().map((t) => t.name)
      expect(names).toContain('search_similar_pids')
      expect(names).toContain('search_similar_dtcs')
      expect(names).toContain('search_similar_diagnoses')
      expect(names).toContain('search_similar_ecus')
      expect(names).toContain('index_pid')
      expect(names).toContain('index_dtc')
      expect(names).toContain('index_diagnosis')
      expect(names).toContain('index_ecu')
      expect(names).toHaveLength(15)
    })

    it('2.3 createMcpServer without knowledgeStack does not register knowledge tools', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const names = mcp.listTools().map((t) => t.name)
      expect(names).not.toContain('search_similar_pids')
      expect(names).not.toContain('index_pid')
      expect(names).toHaveLength(7)
    })

    it('2.4 calling a knowledge tool without knowledgeStack throws ToolNotFoundError', async () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      await expect(mcp.callTool('search_similar_pids', { query: 'battery' })).rejects.toThrow(
        ToolNotFoundError,
      )
    })
  })

  describe('Section 3 — Search tools', () => {
    it('3.1 search_similar_pids returns formatted results with distance', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_pids', { query: 'battery temp' })

      expect(result.content[0].text).toContain('0.12')
      expect(stack.pidsIndex.search).toHaveBeenCalledWith('battery temp', {
        limit: 5,
        filter: undefined,
      })
    })

    it('3.1 search_similar_pids passes manufacturer/model filter', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      await mcp.callTool('search_similar_pids', {
        query: 'battery',
        manufacturer: 'Toyota',
        model: 'Auris',
      })

      expect(stack.pidsIndex.search).toHaveBeenCalledWith('battery', {
        limit: 5,
        filter: { manufacturer: 'Toyota', model: 'Auris' },
      })
    })

    it('3.3 search_similar_pids returns no-results message when empty', async () => {
      const stack = mockKnowledgeStack({
        pidsIndex: { search: vi.fn().mockResolvedValue([]) },
      })
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_pids', { query: 'nonexistent' })

      expect(result.content[0].text).toBe('No PIDs found.')
    })

    it('3.5 search_similar_dtcs returns formatted results', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_dtcs', { query: 'battery overheat' })

      expect(result.content[0].text).toContain('0.23')
      expect(stack.dtcsIndex.search).toHaveBeenCalledWith('battery overheat', {
        limit: 5,
        filter: undefined,
      })
    })

    it('3.5 search_similar_dtcs returns no-results message when empty', async () => {
      const stack = mockKnowledgeStack({
        dtcsIndex: { search: vi.fn().mockResolvedValue([]) },
      })
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_dtcs', { query: 'nonexistent' })

      expect(result.content[0].text).toBe('No DTCs found.')
    })

    it('3.5 search_similar_diagnoses returns formatted results', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_diagnoses', { query: 'loss of power' })

      expect(result.content[0].text).toContain('0.34')
      expect(stack.diagnosisIndex.search).toHaveBeenCalledWith('loss of power', {
        limit: 5,
        filter: undefined,
      })
    })

    it('3.5 search_similar_diagnoses respects custom limit', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      await mcp.callTool('search_similar_diagnoses', { query: 'power', limit: 3 })

      expect(stack.diagnosisIndex.search).toHaveBeenCalledWith('power', {
        limit: 3,
        filter: undefined,
      })
    })

    it('3.5 search_similar_diagnoses returns no-results message when empty', async () => {
      const stack = mockKnowledgeStack({
        diagnosisIndex: { search: vi.fn().mockResolvedValue([]) },
      })
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_diagnoses', { query: 'nonexistent' })

      expect(result.content[0].text).toBe('No diagnoses found.')
    })
  })

  describe('Section 4 — index_pid', () => {
    it('4.1 index_pid without validation data indexes with initial confidence and validated:false', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_pid', {
        embeddedText: 'New PID for hybrid battery SOC',
        manufacturer: 'Toyota',
        model: 'Auris',
        source: 'web',
      })

      expect(stack.pidsIndex.index).toHaveBeenCalledTimes(1)
      const indexed = (stack.pidsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as PidKnowledgeEntry
      expect(indexed.embeddedText).toBe('New PID for hybrid battery SOC')
      expect(indexed.manufacturer).toBe('Toyota')
      expect(indexed.model).toBe('Auris')
      expect(indexed.source).toBe(KnowledgeSource.Web)
      expect(indexed.confidence).toBe(0.3)
      expect(indexed.validated).toBe(false)
      expect(result.content[0].text).toContain('unvalidated')
    })

    it('4.3 index_pid with validation data validates and scales confidence', async () => {
      const repo = mockObdRepo({ readPidRaw: vi.fn().mockResolvedValue([0x0b, 0xb8]) })
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(repo, mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_pid', {
        embeddedText: 'Validated PID',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'web',
        mode: '01',
        pid: '0C',
        formula: '(A*256+B)/4',
        dataBytes: 2,
      })

      expect(stack.pidsIndex.index).toHaveBeenCalledTimes(1)
      const indexed = (stack.pidsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as PidKnowledgeEntry
      expect(indexed.validated).toBe(true)
      expect(indexed.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.content[0].text).toContain('validated')
    })

    it('4.5 index_pid with mechanic source gets higher initial confidence', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_pid', {
        embeddedText: 'Mechanic-provided PID',
        manufacturer: 'Toyota',
        model: 'Auris',
        source: 'mechanic',
      })

      const indexed = (stack.pidsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as PidKnowledgeEntry
      expect(indexed.source).toBe(KnowledgeSource.Mechanic)
      expect(indexed.confidence).toBe(0.8)
      expect(result.content[0].text).toContain('0.8')
    })

    it('4.5 index_pid with validation producing out_of_range still indexes', async () => {
      const repo = mockObdRepo({ readPidRaw: vi.fn().mockResolvedValue([0xff, 0xff]) })
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(repo, mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_pid', {
        embeddedText: 'Out of range PID',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'web',
        mode: '01',
        pid: '0C',
        formula: '(A*256+B)/4',
        dataBytes: 2,
        minValue: 0,
        maxValue: 100,
      })

      const indexed = (stack.pidsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as PidKnowledgeEntry
      expect(indexed.validated).toBe(false)
      expect(result.content[0].text).toContain('out_of_range')
    })
  })

  describe('Section 5 — index_dtc', () => {
    it('5.1 index_dtc without code indexes without validation', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_dtc', {
        embeddedText: 'New DTC for hybrid battery fault',
        manufacturer: 'Toyota',
        model: 'Auris',
        source: 'web',
      })

      expect(stack.dtcsIndex.index).toHaveBeenCalledTimes(1)
      const indexed = (stack.dtcsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DtcKnowledgeEntry
      expect(indexed.validated).toBe(false)
      expect(indexed.source).toBe(KnowledgeSource.Web)
      expect(result.content[0].text).toContain('unvalidated')
    })

    it('5.3 index_dtc with code present validates successfully', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P1234', description: 'Test DTC' }]),
      })
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(repo, mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_dtc', {
        embeddedText: 'Validated DTC',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'web',
        code: 'P1234',
      })

      const indexed = (stack.dtcsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DtcKnowledgeEntry
      expect(indexed.validated).toBe(true)
      expect(indexed.confidence).toBeGreaterThanOrEqual(0.7)
      expect(result.content[0].text).toContain('validated')
    })

    it('5.4 index_dtc with code not present in vehicle returns not_found', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockResolvedValue([{ code: 'P0301', description: 'Misfire' }]),
      })
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(repo, mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_dtc', {
        embeddedText: 'Missing DTC',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'web',
        code: 'P9999',
      })

      const indexed = (stack.dtcsIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DtcKnowledgeEntry
      expect(indexed.validated).toBe(false)
      expect(result.content[0].text).toContain('not_found')
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
  })

  describe('Section 6 — index_diagnosis', () => {
    it('6.1 index_diagnosis indexes with fixed PreviousDiagnosis source and confidence 0.5', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('index_diagnosis', {
        embeddedText: 'Resolved case: battery degradation in Auris Hybrid',
        manufacturer: 'Toyota',
        model: 'Auris',
        symptoms: ['loss of power', 'battery warning'],
        pidsInvolved: ['01 0C'],
      })

      expect(stack.diagnosisIndex.index).toHaveBeenCalledTimes(1)
      const indexed = (stack.diagnosisIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as DiagnosisKnowledgeEntry
      expect(indexed.embeddedText).toBe('Resolved case: battery degradation in Auris Hybrid')
      expect(indexed.source).toBe(KnowledgeSource.PreviousDiagnosis)
      expect(indexed.confidence).toBe(0.5)
      expect(indexed.symptoms).toEqual(['loss of power', 'battery warning'])
      expect(indexed.pidsInvolved).toEqual(['01 0C'])
      expect(result.content[0].text).toContain('Indexed diagnosis')
    })
  })

  describe('Section 7 — index_ecu and search_similar_ecus', () => {
    it('7.1 search_similar_ecus returns formatted results with distance', async () => {
      const stack = mockKnowledgeStack()
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo(), stack)

      const result = await mcp.callTool('search_similar_ecus', { query: 'transmission 7E9' })

      expect(result.content[0].text).toContain('0.45')
      expect(stack.ecusIndex.search).toHaveBeenCalledWith('transmission 7E9', {
        limit: 5,
        filter: undefined,
      })
    })

    it('7.2 index_ecu writes to ecu_definitions (SQLite) and ecus_index (LanceDB)', async () => {
      const stack = mockKnowledgeStack()
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(mockObdRepo(), vRepo, stack)

      const result = await mcp.callTool('index_ecu', {
        embeddedText: 'Audi A3 transmission control module at response address 7E9',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'mechanic',
        responseAddr: '7e9',
        requestAddr: '7e1',
        name: 'Transmission Control Module',
        type: 'TCM',
        system: 'Transmission',
      })

      expect(vRepo.upsertEcuDefinition).toHaveBeenCalledTimes(1)
      const definition = (vRepo.upsertEcuDefinition as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as {
        responseAddr: string
        requestAddr: string
        name: string
        confidence: number
        source: string
      }
      expect(definition.responseAddr).toBe('7E9')
      expect(definition.requestAddr).toBe('7E1')
      expect(definition.name).toBe('Transmission Control Module')
      expect(definition.confidence).toBe(0.8)
      expect(definition.source).toBe('mechanic')

      expect(stack.ecusIndex.index).toHaveBeenCalledTimes(1)
      const indexed = (stack.ecusIndex.index as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as EcuKnowledgeEntry
      expect(indexed.manufacturer).toBe('Audi')
      expect(indexed.responseAddr).toBe('7E9')
      expect(indexed.source).toBe(KnowledgeSource.Mechanic)

      // Las ECUs no admiten validacion OBD: el mensaje no debe insinuar que
      // estan "pendientes de validar", sino reportar la fuente de la confianza.
      expect(result.content[0].text).toContain('source mechanic')
      expect(result.content[0].text).not.toContain('unvalidated')
    })

    it('7.3 index_ecu with web source gets lower confidence (0.3)', async () => {
      const stack = mockKnowledgeStack()
      const vRepo = mockVehicleRepo()
      const mcp = createMcpServer(mockObdRepo(), vRepo, stack)

      await mcp.callTool('index_ecu', {
        embeddedText: 'Unknown ECU at 7DA',
        manufacturer: 'Audi',
        model: 'A3',
        source: 'web',
        responseAddr: '7DA',
        requestAddr: '7D2',
        name: 'Unknown Module',
        type: 'UNKNOWN',
      })

      const definition = (vRepo.upsertEcuDefinition as ReturnType<typeof vi.fn>).mock
        .calls[0][0] as { confidence: number; source: string }
      expect(definition.confidence).toBe(0.3)
      expect(definition.source).toBe('web')
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
