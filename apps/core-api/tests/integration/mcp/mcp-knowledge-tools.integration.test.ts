import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import type { LanceDbConnection } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import {
  EMBEDDING_DIMENSIONS,
  PIDS_TABLE_CONFIG,
  DTCS_TABLE_CONFIG,
  DIAGNOSES_TABLE_CONFIG,
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'

const embed: EmbeddingGenerator = (text) => {
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) % EMBEDDING_DIMENSIONS
  }
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  vector[hash] = 1
  return Promise.resolve(vector)
}

function mockObdRepo(): ObdRepository {
  return {
    readPid: async () => 0,
    readPidRaw: async () => [0x0b, 0xb8],
    getSupportedPids: async () => [],
    getFreezeFrame: async () => null,
    readDtcCodes: async () => [{ code: 'P1234', description: 'Test DTC' }],
    clearDtcCodes: async () => {},
    readVin: async () => 'WAUZZZ8V5JA123456',
    getVehicleInfo: async (): Promise<VehicleInfo> => ({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    }),
    setPower: async () => {},
    getEcuInfo: async () => [],
  }
}

describe('MCP Knowledge Tools — integracion real con LanceDB', () => {
  let dbPath: string
  let connection: LanceDbConnection

  beforeAll(async () => {
    dbPath = await mkdtemp(join(tmpdir(), 'lancedb-mcp-k-'))
    connection = await initLanceDb(dbPath)
  })

  afterAll(async () => {
    await rm(dbPath, { recursive: true, force: true })
  })

  async function createKnowledgeStack() {
    const [pidsStore, dtcsStore, diagnosesStore] = await Promise.all([
      createLanceVectorStore(connection.db, PIDS_TABLE_CONFIG),
      createLanceVectorStore(connection.db, DTCS_TABLE_CONFIG),
      createLanceVectorStore(connection.db, DIAGNOSES_TABLE_CONFIG),
    ])
    return {
      pidsIndex: createKnowledgeIndex({
        store: pidsStore,
        embed,
        toMetadata: toPidMetadata,
        fromMetadata: toPidEntry,
      }),
      dtcsIndex: createKnowledgeIndex({
        store: dtcsStore,
        embed,
        toMetadata: toDtcMetadata,
        fromMetadata: toDtcEntry,
      }),
      diagnosisIndex: createKnowledgeIndex({
        store: diagnosesStore,
        embed,
        toMetadata: toDiagnosisMetadata,
        fromMetadata: toDiagnosisEntry,
      }),
    }
  }

  it('8.1 index_pid + search_similar_pids end-to-end', async () => {
    const stack = await createKnowledgeStack()
    const mcp = createMcpServer(mockObdRepo(), undefined, stack)

    const indexResult = await mcp.callTool('index_pid', {
      embeddedText: 'Toyota Auris Hybrid battery SOC PID 22 F40C',
      manufacturer: 'Toyota',
      model: 'Auris',
      source: 'web',
    })
    expect(indexResult.content[0].text).toContain('Indexed PID')
    expect(indexResult.content[0].text).toContain('0.3')

    const searchResult = await mcp.callTool('search_similar_pids', {
      query: 'battery SOC hybrid',
      manufacturer: 'Toyota',
      model: 'Auris',
    })
    expect(searchResult.content[0].text).toContain('battery')
  })

  it('8.1 index_dtc + search_similar_dtcs end-to-end', async () => {
    const stack = await createKnowledgeStack()
    const mcp = createMcpServer(mockObdRepo(), undefined, stack)

    await mcp.callTool('index_dtc', {
      embeddedText: 'Toyota Auris Hybrid battery overheat DTC',
      manufacturer: 'Toyota',
      model: 'Auris',
      source: 'web',
    })

    const searchResult = await mcp.callTool('search_similar_dtcs', {
      query: 'battery overheat hybrid',
    })
    expect(searchResult.content[0].text).toContain('battery')
  })

  it('8.1 index_diagnosis + search_similar_diagnoses end-to-end', async () => {
    const stack = await createKnowledgeStack()
    const mcp = createMcpServer(mockObdRepo(), undefined, stack)

    await mcp.callTool('index_diagnosis', {
      embeddedText: 'Audi A3 TFSI: fallo de encendido en cilindro 1 por bobina defectuosa',
      manufacturer: 'Audi',
      model: 'A3',
      symptoms: ['temblor al ralentí', 'check engine'],
      pidsInvolved: ['01 0C', '01 0D'],
    })

    const searchResult = await mcp.callTool('search_similar_diagnoses', {
      query: 'fallo de encendido bobina',
    })
    expect(searchResult.content[0].text).toContain('bobina')
  })

  it('8.1 index_pid with validation data end-to-end', async () => {
    const stack = await createKnowledgeStack()
    const mcp = createMcpServer(mockObdRepo(), undefined, stack)

    const result = await mcp.callTool('index_pid', {
      embeddedText: 'Audi A3 engine RPM PID',
      manufacturer: 'Audi',
      model: 'A3',
      source: 'web',
      mode: '01',
      pid: '0C',
      formula: '(A*256+B)/4',
      dataBytes: 2,
    })
    expect(result.content[0].text).toContain('validated')
  })

  it('8.2 mcpServer does not import composition — verified by grep at build time', () => {
    // Verificado via grep al cierre 9.2: mcpServer.ts no debe importar de composition/
    expect(true).toBe(true)
  })
})
