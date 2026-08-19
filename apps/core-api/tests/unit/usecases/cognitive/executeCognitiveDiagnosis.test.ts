import { describe, it, expect, vi } from 'vitest'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import type {
  LlmClientPort,
  McpToolDefinition,
  ToolCallHandlerPort,
  ToolCallTrace,
} from '@/application/ports/LlmClientPort.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'
import { Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/** Las 6 tools del MCP Server (mismas que listTools devuelve en producción). */
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

const mockEntry1: DiagnosisKnowledgeEntry = {
  id: 'case-001',
  embeddedText: 'Audi A3 2018 TFSI: fallo de encendido en cilindro 1 por bobina defectuosa',
  manufacturer: 'Audi',
  model: 'A3',
  symptoms: ['temblor', 'ralentí irregular'],
  pidsInvolved: ['0C', '0D'],
}

const mockEntry2: DiagnosisKnowledgeEntry = {
  id: 'case-002',
  embeddedText: 'Golf 2017 TSI: vibración en ralentí por soporte de motor desgastado',
  manufacturer: 'Volkswagen',
  model: 'Golf',
  symptoms: ['vibración', 'ralentí'],
  pidsInvolved: ['0C'],
}

function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

/** Resultado LLM: narrativa + bloque ---JSON--- válido. */
function cognitiveResponse(
  text: string,
  toolCalls: ToolCallTrace[] = [],
): { text: string; toolCalls: ToolCallTrace[] } {
  return { text, toolCalls }
}

function makeUseCase(
  llmClient?: LlmClientPort,
  handler?: ToolCallHandlerPort,
): ExecuteCognitiveDiagnosisUseCase {
  return new ExecuteCognitiveDiagnosisUseCase({
    llmClient: llmClient ?? mockLlmClient({ sendMessage: vi.fn() }),
    tools: sixTools,
    handler: handler ?? vi.fn(),
    logger: createMockLogger(),
  })
}

function mockDiagnosisIndex(
  entries: DiagnosisKnowledgeEntry[],
  distances: number[] = [],
): DiagnosisVectorRepository {
  return {
    search: vi.fn().mockResolvedValue(
      entries.map((entry, i) => ({
        entry,
        distance: distances[i] ?? 0.1 * (i + 1),
      })),
    ),
    index: vi.fn(),
  }
}

function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

describe('executeCognitiveDiagnosis', () => {
  it('should pass conversationHistory from execute to sendMessage', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const historyItem = { __type: 'user_message' as const, content: '¿Por qué tiembla el motor?' }

    await makeUseCase(llmClient).execute({
      userQuery: '¿Y eso por qué?',
      vehicleContext,
      conversationHistory: [historyItem],
    })

    expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.conversationHistory).toEqual([historyItem])
  })

  it('should call sendMessage with systemPrompt, userMessage, tools and handler', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const handler: ToolCallHandlerPort = vi.fn(async () => 'result')

    await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler,
      logger: createMockLogger(),
    }).execute({
      userQuery: '¿Por qué tiembla el motor al ralentí?',
      vehicleContext,
    })

    expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
    const callArgs = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]
    const input = callArgs[0]
    const handlerArg = callArgs[1]
    expect(input.systemPrompt).toContain('diagnost')
    expect(input.tools).toBe(sixTools)
    expect(handlerArg).toBe(handler)
    expect(input.userMessage).toContain('¿Por qué tiembla el motor al ralentí?')
    expect(input.userMessage).toContain('Audi')
    expect(input.userMessage).toContain('A3')
  })

  it('should forward a handler that bridges to mcpServer.callTool content text', async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '750' }] })
    const handler: ToolCallHandlerPort = async (name, args) => {
      const result = await callTool(name, args)
      return result.content[0].text
    }
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })

    await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler,
      logger: createMockLogger(),
    }).execute({})

    const handlerArg = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][1]
    expect(handlerArg).toBe(handler)
    await expect(handlerArg('read_pid', { mode: '01', pid: '0C' })).resolves.toBe('750')
    expect(callTool).toHaveBeenCalledWith('read_pid', { mode: '01', pid: '0C' })
  })

  it('should parse a valid ---JSON--- block into severity, confidence and recommendations', async () => {
    const text =
      'El motor falla en el cilindro 1. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.diagnosis).toBe('El motor falla en el cilindro 1.')
    expect(result.severity).toBe(Severity.High)
    expect(result.confidence).toBe(0.9)
    expect(result.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
  })

  it('should fall back to defaults when the response has no ---JSON--- block', async () => {
    const text = 'Diagnóstico plano sin bloque estructurado.'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.diagnosis).toBe(text)
    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should parse a ---JSON\\n block (DeepSeek real format with newline separator)', async () => {
    // DeepSeek emite: ---JSON\n{...}\n--- en vez de ---JSON---{...}---
    const text =
      'El motor falla en el cilindro 1.\n---JSON\n{"severity":"high","confidence":0.78,"recommendations":["Revisar bujías","Cambiar bobina","Verificar compresión"]}\n---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.diagnosis).toBe('El motor falla en el cilindro 1.')
    expect(result.severity).toBe(Severity.High)
    expect(result.confidence).toBe(0.78)
    expect(result.recommendations).toEqual([
      'Revisar bujías',
      'Cambiar bobina',
      'Verificar compresión',
    ])
  })

  it('should parse a ---JSON--- block with trailing whitespace before closing ---', async () => {
    // Variante: ---JSON---{...}\n--- (espacio/newline antes del cierre)
    const text =
      'Diagnóstico.\n---JSON---{"severity":"low","confidence":0.6,"recommendations":["ok"]}\n---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.severity).toBe(Severity.Low)
    expect(result.confidence).toBe(0.6)
    expect(result.recommendations).toEqual(['ok'])
  })

  it('should fall back to defaults when the ---JSON--- block is malformed', async () => {
    const text = 'Narrativa. ---JSON---{"severity": }---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.diagnosis).toBe('Narrativa.')
    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should fall back to defaults when confidence is out of range', async () => {
    const text = '---JSON---{"severity":"high","confidence":2,"recommendations":["x"]}---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should propagate MaxToolCallIterationsError from sendMessage', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi
        .fn()
        .mockRejectedValue(
          new MaxToolCallIterationsError('Exceeded maximum tool call iterations (10).', []),
        ),
    })

    await expect(
      new ExecuteCognitiveDiagnosisUseCase({
        llmClient,
        tools: sixTools,
        handler: vi.fn(),
        logger: createMockLogger(),
      }).execute({}),
    ).rejects.toBeInstanceOf(MaxToolCallIterationsError)
  })

  it('should include toolCalls from the LLM session in the result', async () => {
    const toolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
      { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
    ]
    const llmClient = mockLlmClient({
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          cognitiveResponse(
            'Narrativa ---JSON---{"severity":"low","confidence":0.8,"recommendations":[]}---',
            toolCalls,
          ),
        ),
    })

    const result = await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({})

    expect(result.toolCalls).toEqual(toolCalls)
  })

  it('should work without userQuery and vehicleContext', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })

    const result = await makeUseCase(llmClient).execute({})

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).toBeTruthy()
    expect(result.diagnosis).toBe('ok')
  })

  it('should accept an options object instead of positional args', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const handler: ToolCallHandlerPort = vi.fn(async () => 'result')

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler,
      logger: createMockLogger(),
    })

    const result = await useCase.execute({})
    expect(result.diagnosis).toBe('ok')
    expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
    const callArgs = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]
    const input = callArgs[0]
    const handlerArg = callArgs[1]
    expect(input.tools).toBe(sixTools)
    expect(handlerArg).toBe(handler)
  })

  it('should include Casos similares previos section when diagnosisIndex returns results', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const index = mockDiagnosisIndex([mockEntry1, mockEntry2])

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      diagnosisIndex: index,
      logger: createMockLogger(),
    })

    await useCase.execute({ userQuery: 'tiembla al ralentí', vehicleContext })

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).toContain('Casos similares previos:')
    // La distancia numerica se sustituyo por una etiqueta cualitativa: el modelo
    // la leia en su propio prompt y la repetia en la narrativa ("distancia 1.40").
    expect(input.userMessage).toContain('[muy similar]')
    expect(input.userMessage).not.toMatch(/distancia\s*\d/)
    // El catalogo lo alimentan otros usuarios: llega envuelto como no confiable.
    expect(input.userMessage).toContain('<untrusted-catalog-result>')
    expect(index.search).toHaveBeenCalledWith('tiembla al ralentí', {
      limit: 5,
      filter: { manufacturer: 'Audi', model: 'A3' },
    })
  })

  it('should not add Casos similares section when diagnosisIndex is absent', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })

    // Use case sin diagnosisIndex (opcion por defecto)
    await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
    }).execute({ userQuery: 'test', vehicleContext })

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).not.toContain('Casos similares previos')
  })

  it('should not add Casos similares section when search returns empty results', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const index = mockDiagnosisIndex([])

    await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      diagnosisIndex: index,
      logger: createMockLogger(),
    }).execute({ userQuery: 'test', vehicleContext })

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).not.toContain('Casos similares previos')
  })

  it('should log a warning and continue when diagnosisIndex.search rejects', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const logger = createMockLogger()
    const index: DiagnosisVectorRepository = {
      search: vi.fn().mockRejectedValue(new Error('Vector store unavailable')),
      index: vi.fn(),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      diagnosisIndex: index,
      logger,
    })

    // Should not throw — the diagnosis completes without RAG context.
    const result = await useCase.execute({ userQuery: 'test', vehicleContext })
    expect(result.diagnosis).toBe('ok')

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).not.toContain('Casos similares previos')
    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      'RAG search failed, continuing without similar cases',
      expect.objectContaining({ error: 'Vector store unavailable' }),
    )
  })

  it('should index the resolved case when diagnosisIndex is present', async () => {
    const llmText = 'Narrativa del diagnóstico'
    const toolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
      { tool: 'read_pid', args: { mode: '01', pid: '0D' }, result: '90' },
      { tool: 'get_dtc_codes', args: {}, result: 'P0301' },
    ]
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(llmText, toolCalls)),
    })
    const index = mockDiagnosisIndex([])

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      diagnosisIndex: index,
      logger: createMockLogger(),
    })

    await useCase.execute({ userQuery: 'tiembla al ralentí', vehicleContext })

    expect(index.index).toHaveBeenCalledTimes(1)
    const entry = (index.index as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as DiagnosisKnowledgeEntry
    expect(typeof entry.id).toBe('string')
    expect(entry.id.length).toBeGreaterThan(0)
    expect(entry.embeddedText).toBe(llmText)
    expect(entry.manufacturer).toBe('Audi')
    expect(entry.model).toBe('A3')
    expect(entry.symptoms).toEqual(['tiembla al ralentí'])
    expect(entry.pidsInvolved).toEqual(['0C', '0D'])

    vi.restoreAllMocks()
  })

  it('should not attempt to index when diagnosisIndex is absent', async () => {
    const llmText = 'Narrativa'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(llmText)),
    })
    // Spy on index to ensure it's never called — we create a diagnosisIndex
    // but construct WITHOUT it, so the spy verifies nothing unexpected happens.
    const spy = mockDiagnosisIndex([])

    await new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      logger: createMockLogger(),
      // Sin diagnosisIndex
    }).execute({ userQuery: 'test', vehicleContext })

    // El caso de uso no tiene acceso al indice, asi que index jamas se llama.
    expect(spy.index).not.toHaveBeenCalled()
    expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
  })

  it('should log a warning and still return result when diagnosisIndex.index rejects', async () => {
    const llmText = 'Narrativa del diagnóstico'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(llmText)),
    })
    const logger = createMockLogger()
    const index: DiagnosisVectorRepository = {
      search: vi.fn().mockResolvedValue([]),
      index: vi.fn().mockRejectedValue(new Error('Index write failed')),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
      diagnosisIndex: index,
      logger,
    })

    // No debe lanzar — el diagnostico se completa igual.
    const result = await useCase.execute({ userQuery: 'test', vehicleContext })
    expect(result.diagnosis).toBe(llmText)

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to index resolved case, continuing',
      expect.objectContaining({ error: 'Index write failed' }),
    )

    vi.restoreAllMocks()
  })

  it('should expose pidObservations derived from the read_pid tool calls', async () => {
    const toolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '850' },
      { tool: 'read_pid', args: { mode: '01', pid: '42' }, result: '10.9' },
      { tool: 'get_dtc_codes', args: {}, result: 'P0301' },
    ]
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('Narrativa', toolCalls)),
    })

    const result = await makeUseCase(llmClient).execute({ userQuery: 'test', vehicleContext })

    expect(result.pidObservations).toEqual([
      { code: '01 0C', name: 'Régimen del motor', unit: 'rpm', value: 850, status: 'ok' },
      {
        code: '01 42',
        name: 'Voltaje del módulo de control',
        unit: 'V',
        value: 10.9,
        status: 'review',
      },
    ])
    expect(result.toolCalls).toEqual(toolCalls)
  })

  it('should expose an empty pidObservations list when no PID was read', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('Narrativa')),
    })

    const result = await makeUseCase(llmClient).execute({ userQuery: 'test', vehicleContext })

    expect(result.pidObservations).toEqual([])
  })
})
