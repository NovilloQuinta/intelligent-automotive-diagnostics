import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import crypto from 'node:crypto'
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import type { LlmClientPort, ToolCallTrace } from '@/application/ports/LlmClientPort.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import type { LanceDbConnection } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import {
  EMBEDDING_DIMENSIONS,
  DIAGNOSES_TABLE_CONFIG,
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'

/**
 * Embedding determinista basado en hash: reparte cada texto en un eje distinto,
 * asi que textos identicos producen el mismo vector (distancia 0).
 *
 * Evita descargar el modelo de 118 MB en el pipeline de CI.
 */
const embed: EmbeddingGenerator = (text) => {
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) % EMBEDDING_DIMENSIONS
  }
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  vector[hash] = 1
  return Promise.resolve(vector)
}

const sixTools: McpToolDefinition[] = [
  { name: 'read_pid', description: 'Read an OBD-II PID value.', schema: { type: 'object' } },
  { name: 'get_dtc_codes', description: 'Read stored DTCs.', schema: { type: 'object' } },
  { name: 'get_freeze_frame', description: 'Get freeze frame data.', schema: { type: 'object' } },
  { name: 'read_vin', description: 'Read VIN.', schema: { type: 'object' } },
  { name: 'get_vehicle_info', description: 'Get vehicle info.', schema: { type: 'object' } },
  { name: 'get_available_pids', description: 'List known PIDs.', schema: { type: 'object' } },
]

const vehicleContext: VehicleInfo = {
  make: 'Audi',
  model: 'A3',
  year: 2018,
  engineType: '2.0 TFSI',
  vin: new Vin('WAUZZZ8V5JA123456'),
}

function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/** Respuesta LLM que incluye toolCalls con read_pid para verificar pidsInvolved. */
function cognitiveResponse(
  text: string,
  toolCalls: ToolCallTrace[] = [],
): { text: string; toolCalls: ToolCallTrace[] } {
  return { text, toolCalls }
}

/**
 * Integracion punta a punta del bucle RAG: index → search → Casos similares previos.
 *
 * Usa LanceDB real en un directorio temporal y embedding determinista.
 * El cliente LLM esta mockeado — no se llama a ninguna API externa.
 */
describe('RAG loop e2e', () => {
  let dbPath: string
  let connection: LanceDbConnection
  let diagnosisIndex: DiagnosisVectorRepository

  beforeAll(async () => {
    dbPath = await mkdtemp(join(tmpdir(), 'lancedb-rag-'))
    connection = await initLanceDb(dbPath)
    const store = await createLanceVectorStore(connection.db, DIAGNOSES_TABLE_CONFIG)
    diagnosisIndex = createKnowledgeIndex({
      store,
      embed,
      toMetadata: toDiagnosisMetadata,
      fromMetadata: toDiagnosisEntry,
    })
  })

  afterAll(async () => {
    await rm(dbPath, { recursive: true, force: true })
  })

  it('should index a resolved case and retrieve it in a subsequent similar diagnosis', async () => {
    const uuidSpy = vi.spyOn(crypto, 'randomUUID')
    uuidSpy.mockReturnValue('e2e-test-uuid')

    const firstText =
      'El motor tiembla en ralentí por fallo de encendido en cilindro 1. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
    const firstToolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
      { tool: 'get_dtc_codes', args: {}, result: 'P0301' },
    ]

    // ----- Primer diagnostico: indexa el caso -----
    const llmClient1: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(firstText, firstToolCalls)),
    }
    const handler1: ToolCallHandler = vi.fn()
    const logger1 = createMockLogger()

    const useCase1 = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: llmClient1,
      tools: sixTools,
      handler: handler1,
      logger: logger1,
      diagnosisIndex,
    })

    const result1 = await useCase1.execute({
      userQuery: 'tiembla al ralentí',
      vehicleContext,
    })

    expect(result1.diagnosis).toBe(
      'El motor tiembla en ralentí por fallo de encendido en cilindro 1.',
    )
    expect(result1.toolCalls).toEqual(firstToolCalls)

    // ----- Segundo diagnostico: debe encontrar el caso indexado -----
    const secondText =
      'El motor vibra al ralentí, posible fallo de encendido. ---JSON---{"severity":"medium","confidence":0.7,"recommendations":["Verificar bujías"]}---'
    const secondToolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '740' },
    ]

    const llmClient2: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(secondText, secondToolCalls)),
    }
    const logger2 = createMockLogger()

    const useCase2 = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: llmClient2,
      tools: sixTools,
      handler: vi.fn(),
      logger: logger2,
      diagnosisIndex,
    })

    const result2 = await useCase2.execute({
      userQuery: 'vibra al ralentí',
      vehicleContext,
    })

    expect(result2.diagnosis).toBe('El motor vibra al ralentí, posible fallo de encendido.')

    // Verificar que el mensaje incluye la seccion de casos similares
    const sendMessageCall = (llmClient2.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]
    const userMessage = sendMessageCall[0].userMessage as string
    expect(userMessage).toContain('Casos similares previos:')
    // El embeddedText del caso indexado es el texto completo devuelto por el LLM
    // (incluye el bloque JSON). Verificamos que aparece en la seccion de similares.
    expect(userMessage).toContain('fallo de encendido en cilindro 1')

    uuidSpy.mockRestore()
  })
})
