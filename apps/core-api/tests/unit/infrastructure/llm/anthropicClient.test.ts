import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { LlmTimeoutError, LlmApiError } from '@/infrastructure/llm/llmErrors.js'
import { TruncatedLlmResponseError } from '@/application/llm/llmErrors.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/** Logger de test: el cliente exige un LoggerPort explicito, sin fallback a console. */
const testLogger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

/** Mock de @anthropic-ai/sdk. */
const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create: mockCreate },
    })),
    __esModule: true,
  }
})

/** Helper que crea un bloque de texto Anthropic. */
function textBlock(text: string) {
  return { type: 'text' as const, text }
}

/** Helper que crea un bloque tool_use Anthropic. */
function toolUseBlock(id: string, name: string, input: Record<string, unknown>) {
  return { type: 'tool_use' as const, id, name, input }
}

/** Helper que crea un mensaje Anthropic simulado. */
function anthropicMessage(params: { content: unknown[]; stop_reason: string; model: string }) {
  return {
    id: 'msg_' + Math.random().toString(36).slice(2, 8),
    type: 'message',
    role: 'assistant',
    model: params.model,
    content: params.content,
    stop_reason: params.stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/** Tool definition de ejemplo. */
const sampleToolDef = {
  name: 'read_pid',
  description: 'Read OBD-II PID',
  schema: {
    type: 'object',
    properties: {
      mode: { type: 'string' },
      pid: { type: 'string' },
    },
  } as Record<string, unknown>,
}

describe('AnthropicClient', () => {
  let client: LlmClientPort
  let handler: ToolCallHandlerPort

  beforeEach(() => {
    vi.clearAllMocks()
    client = createAnthropicClient({ apiKey: 'test-key', logger: testLogger })
    handler = vi.fn()
  })

  // ── 4.1: Respuesta texto directa (sin tool calling) ──

  it('should return text response without tool calls when Claude responds with end_turn', async () => {
    const mockMessage = anthropicMessage({
      content: [textBlock('El diagnostico indica fallo en el sensor MAF.')],
      stop_reason: 'end_turn',
      model: 'claude-sonnet-4-20250514',
    })
    mockCreate.mockResolvedValueOnce(mockMessage)

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico experto.',
        userMessage: 'RPM 0, coolant 95C, DTC P0101',
        tools: [],
      },
      handler,
    )

    expect(result.text).toBe('El diagnostico indica fallo en el sensor MAF.')
    expect(result.toolCalls).toEqual([])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  // La temperatura es la unica palanca de determinismo que da la Messages API de
  // Anthropic —`seed` no existe ahi—, y sin ella las evals se corren al 1.0 por
  // defecto, que es lo peor posible para medir el comportamiento del agente.
  it('manda la temperatura configurada a la API', async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({ content: [textBlock('ok')], stop_reason: 'end_turn', model: 'm' }),
    )
    const deterministic = createAnthropicClient({
      apiKey: 'test-key',
      logger: testLogger,
      temperature: 0,
    })

    await deterministic.sendMessage({ systemPrompt: 's', userMessage: 'u', tools: [] }, handler)

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ temperature: 0 }))
  })

  // Sin configurar, el cliente aplica su propio default (mas bajo que el 1.0 de
  // fabrica del SDK): no manda el 1.0 sin querer.
  it('aplica el default del cliente cuando no se configura', async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({ content: [textBlock('ok')], stop_reason: 'end_turn', model: 'm' }),
    )

    await client.sendMessage({ systemPrompt: 's', userMessage: 'u', tools: [] }, handler)

    expect(mockCreate.mock.calls[0][0]).toHaveProperty('temperature', 0.3)
  })

  // ── 4.2: Tool calling simple (1 iteracion) ──

  it('should execute tool and return final text after tool_use then end_turn', async () => {
    const toolBlock = toolUseBlock('toolu_001', 'read_pid', { mode: '01', pid: '0C' })
    const mockToolUse = anthropicMessage({
      content: [toolBlock],
      stop_reason: 'tool_use',
      model: 'claude-sonnet-4-20250514',
    })
    const mockEndTurn = anthropicMessage({
      content: [textBlock('RPM: 800 — normal.')],
      stop_reason: 'end_turn',
      model: 'claude-sonnet-4-20250514',
    })
    mockCreate.mockResolvedValueOnce(mockToolUse).mockResolvedValueOnce(mockEndTurn)

    const mockHandler = vi.fn().mockResolvedValue('RPM value: 800')

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico experto.',
        userMessage: 'Dame RPM',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockHandler).toHaveBeenCalledTimes(1)
    expect(mockHandler).toHaveBeenCalledWith('read_pid', { mode: '01', pid: '0C' })
    expect(result.text).toBe('RPM: 800 — normal.')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[0].args).toEqual({ mode: '01', pid: '0C' })
    expect(result.toolCalls[0].result).toBe('RPM value: 800')
  })

  // ── 4.3: Tool calling multiple (3 iteraciones) ──

  it('should handle multiple tool calls across iterations', async () => {
    const t1 = toolUseBlock('toolu_001', 'read_pid', { mode: '01', pid: '0C' })
    const t2 = toolUseBlock('toolu_002', 'get_dtc_codes', {})
    const t3 = toolUseBlock('toolu_003', 'read_vin', {})

    mockCreate
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [t1],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [t2],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [t3],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [textBlock('Diagnostico completo.')],
          stop_reason: 'end_turn',
          model: 'claude-sonnet-4-20250514',
        }),
      )

    const mockHandler = vi
      .fn()
      .mockResolvedValueOnce('RPM: 800')
      .mockResolvedValueOnce('DTCs: P0101, P0302')
      .mockResolvedValueOnce('VIN: WAUZZZ8X')

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico experto.',
        userMessage: 'Diagnostico completo',
        tools: [
          sampleToolDef,
          { name: 'get_dtc_codes', description: 'Get DTCs', schema: {} as Record<string, unknown> },
          { name: 'read_vin', description: 'Read VIN', schema: {} as Record<string, unknown> },
        ],
      },
      mockHandler,
    )

    expect(mockCreate).toHaveBeenCalledTimes(4)
    expect(mockHandler).toHaveBeenCalledTimes(3)
    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[1].tool).toBe('get_dtc_codes')
    expect(result.toolCalls[2].tool).toBe('read_vin')
    expect(result.text).toBe('Diagnostico completo.')
  })

  // ── 4.4: Tool handler lanza error → is_error: true ──

  it('should report tool errors as tool_result with is_error: true and continue', async () => {
    const toolBlock = toolUseBlock('toolu_001', 'read_pid', { mode: '01', pid: '0C' })
    mockCreate
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [toolBlock],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [textBlock('No pude leer el PID, pero el fallo parece ser electrico.')],
          stop_reason: 'end_turn',
          model: 'claude-sonnet-4-20250514',
        }),
      )

    const mockHandler = vi.fn().mockRejectedValue(new Error('OBD timeout'))

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico experto.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].result).toBe('Tool execution failed: read_pid — OBD timeout')
    expect(result.text).toContain('No pude leer el PID')
  })

  // ── 4.5: Tool desconocida → is_error: true ──

  it('should report unknown tool as tool_result with is_error: true', async () => {
    const toolBlock = toolUseBlock('toolu_001', 'unknown_tool', {})
    mockCreate
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [toolBlock],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
      .mockResolvedValueOnce(
        anthropicMessage({
          content: [textBlock('Intentare con otra herramienta.')],
          stop_reason: 'end_turn',
          model: 'claude-sonnet-4-20250514',
        }),
      )

    const mockHandler = vi.fn()

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico experto.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef], // solo read_pid registrada
      },
      mockHandler,
    )

    expect(mockHandler).not.toHaveBeenCalled()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('unknown_tool')
    expect(result.toolCalls[0].result).toContain('Unknown tool')
  })

  // ── 5.1: Limite de iteraciones alcanzado ──

  it('should force a final tools-less answer after default max iterations, instead of throwing, when there is real progress', async () => {
    // 20 respuestas tool_use consecutivas con argumentos distintos: progreso real.
    const pids = Array.from({ length: 20 }, (_, i) => `pid-${i}`)
    for (const [i, pid] of pids.entries()) {
      mockCreate.mockResolvedValueOnce(
        anthropicMessage({
          content: [toolUseBlock(`toolu_${i}`, 'read_pid', { mode: '01', pid })],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
    }
    // La llamada forzada final, sin tools, trae por fin texto.
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({
        content: [textBlock('Diagnóstico con lo reunido.')],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      }),
    )

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(result.text).toBe('Diagnóstico con lo reunido.')
    expect(result.toolCalls).toHaveLength(20)
    expect(mockCreate).toHaveBeenCalledTimes(21)
    expect(mockHandler).toHaveBeenCalledTimes(20)
    const finalCallArgs = mockCreate.mock.calls[20][0] as { tools: unknown[] }
    expect(finalCallArgs.tools).toEqual([])
  })

  // ── 5.2: Limite configurable ──

  it('should respect configurable maxIterations, forcing a final answer instead of throwing', async () => {
    const customClient = createAnthropicClient({
      apiKey: 'test-key',
      logger: testLogger,
      maxIterations: 3,
    })

    const pids = ['0C', '0D', '05']
    for (const [i, pid] of pids.entries()) {
      mockCreate.mockResolvedValueOnce(
        anthropicMessage({
          content: [toolUseBlock(`toolu_00${i}`, 'read_pid', { mode: '01', pid })],
          stop_reason: 'tool_use',
          model: 'claude-sonnet-4-20250514',
        }),
      )
    }
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({
        content: [textBlock('Diagnóstico con lo reunido.')],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      }),
    )

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    const result = await customClient.sendMessage(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(result.text).toBe('Diagnóstico con lo reunido.')
    expect(mockCreate).toHaveBeenCalledTimes(4)
    expect(mockHandler).toHaveBeenCalledTimes(3)
  })

  it('should tolerate the model repeating the exact same tool call more than twice, without throwing early', async () => {
    // Visto contra un modelo real en la bateria de eval: releer el mismo PID no
    // siempre es un atasco. Una version anterior cortaba al tercer repetido y eso
    // rompia sesiones que iban bien.
    const toolBlocks = Array.from({ length: 3 }, (_, i) =>
      anthropicMessage({
        content: [toolUseBlock(`toolu_${i}`, 'read_pid', { mode: '01', pid: '0C' })],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-20250514',
      }),
    )
    for (const msg of toolBlocks) {
      mockCreate.mockResolvedValueOnce(msg)
    }
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({
        content: [textBlock('Diagnóstico con lo reunido.')],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      }),
    )

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    const result = await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(result.text).toBe('Diagnóstico con lo reunido.')
    expect(result.toolCalls).toHaveLength(3)
    expect(mockHandler).toHaveBeenCalledTimes(3)
  })

  // ── 5.3: Timeout de API ──

  it('should throw LlmTimeoutError when SDK throws timeout', async () => {
    const timeoutErr = new Error('Connection timed out')
    timeoutErr.name = 'APIConnectionTimeoutError'
    mockCreate.mockRejectedValue(timeoutErr)

    await expect(
      client.sendMessage(
        {
          systemPrompt: 'Eres un mecanico.',
          userMessage: 'Diagnostico',
          tools: [],
        },
        handler,
      ),
    ).rejects.toThrow(LlmTimeoutError)
  })

  // ── 5.3b: conversationHistory con raw_response { text: ... } (compatible frontend) ──

  it('should handle raw_response with text property from frontend conversation history', async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({
        content: [textBlock('Nueva respuesta del asistente.')],
        stop_reason: 'end_turn',
        model: 'claude-sonnet-4-20250514',
      }),
    )

    await client.sendMessage(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Siguiente pregunta',
        tools: [],
        conversationHistory: [{ __type: 'raw_response', data: { text: 'respuesta previa' } }],
      },
      handler,
    )

    const callArgs = mockCreate.mock.calls[0][0] as {
      messages: Array<{ role: string; content: unknown }>
    }
    const assistantMsg = callArgs.messages.find((m) => m.role === 'assistant')
    expect(assistantMsg).toBeDefined()
    expect(assistantMsg!.content).toBe('respuesta previa')
  })

  // ── truncamiento por limite de tokens de salida ──

  it('should throw TruncatedLlmResponseError when stop_reason is max_tokens', async () => {
    mockCreate.mockResolvedValueOnce(
      anthropicMessage({
        content: [textBlock('Narrativa larga cortada a mitad de fra')],
        stop_reason: 'max_tokens',
        model: 'claude-sonnet-4-20250514',
      }),
    )

    await expect(
      client.sendMessage(
        {
          systemPrompt: 'Eres un mecanico.',
          userMessage: 'Diagnostico completo',
          tools: [],
        },
        handler,
      ),
    ).rejects.toThrow(TruncatedLlmResponseError)
  })

  // ── 5.4: Error de API (4xx/5xx) ──

  it('should throw LlmApiError when SDK throws API error', async () => {
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'))

    await expect(
      client.sendMessage(
        {
          systemPrompt: 'Eres un mecanico.',
          userMessage: 'Diagnostico',
          tools: [],
        },
        handler,
      ),
    ).rejects.toThrow(LlmApiError)
  })
})
