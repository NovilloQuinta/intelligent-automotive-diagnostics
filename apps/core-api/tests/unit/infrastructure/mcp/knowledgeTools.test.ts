import { describe, it, expect, vi } from 'vitest'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { PidVectorRepository } from '@/application/ports/PidVectorRepository.js'
import type { DtcVectorRepository } from '@/application/ports/DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { EcuVectorRepository } from '@/application/ports/EcuVectorRepository.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { EcuKnowledgeEntry } from '@/application/dto/knowledge/EcuKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import { mockObdRepo, mockVehicleRepo } from './mcpTestFactories.js'

describe('knowledgeTools (via createMcpServer)', () => {
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
})
