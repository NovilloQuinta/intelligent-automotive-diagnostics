import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { LlmTimeoutError, LlmApiError } from '@/infrastructure/llm/llmErrors.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
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
  let handler: ToolCallHandler

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
    expect(result.toolCalls[0].result).toBe('Tool execution failed: read_pid')
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

  it('should throw MaxToolCallIterationsError after default max iterations without end_turn', async () => {
    // Prepara 10 respuestas tool_use consecutivas (maximo por defecto)
    const toolBlocks = Array.from({ length: 10 }, (_, i) =>
      anthropicMessage({
        content: [toolUseBlock(`toolu_00${i}`, 'read_pid', { mode: '01', pid: '0C' })],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-20250514',
      }),
    )
    for (const msg of toolBlocks) {
      mockCreate.mockResolvedValueOnce(msg)
    }

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    await expect(
      client.sendMessage(
        {
          systemPrompt: 'Eres un mecanico.',
          userMessage: 'Diagnostico',
          tools: [sampleToolDef],
        },
        mockHandler,
      ),
    ).rejects.toThrow('Exceeded maximum tool call iterations')

    expect(mockCreate).toHaveBeenCalledTimes(10)
    expect(mockHandler).toHaveBeenCalledTimes(10)
  })

  // ── 5.2: Limite configurable ──

  it('should respect configurable maxIterations', async () => {
    const customClient = createAnthropicClient({
      apiKey: 'test-key',
      logger: testLogger,
      maxIterations: 3,
    })

    const toolBlocks = Array.from({ length: 3 }, (_, i) =>
      anthropicMessage({
        content: [toolUseBlock(`toolu_00${i}`, 'read_pid', { mode: '01', pid: '0C' })],
        stop_reason: 'tool_use',
        model: 'claude-sonnet-4-20250514',
      }),
    )
    for (const msg of toolBlocks) {
      mockCreate.mockResolvedValueOnce(msg)
    }

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    await expect(
      customClient.sendMessage(
        {
          systemPrompt: 'Eres un mecanico.',
          userMessage: 'Diagnostico',
          tools: [sampleToolDef],
        },
        mockHandler,
      ),
    ).rejects.toThrow('maximum tool call iterations (3)')

    expect(mockCreate).toHaveBeenCalledTimes(3)
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
