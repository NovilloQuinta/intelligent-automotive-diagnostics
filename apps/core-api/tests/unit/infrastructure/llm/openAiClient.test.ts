import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createOpenAiClient,
  OpenAiTimeoutError,
  OpenAiApiError,
} from '@/infrastructure/llm/openAiClient.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type OpenAI from 'openai'

/** Mock de la funcion `create` del SDK openai. */
const mockCreate = vi.fn()

vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    })),
    __esModule: true,
  }
})

/** Helper que crea una respuesta OpenAI simulada con finish_reason "stop". */
function openAiTextResponse(content: string): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: 'chatcmpl-' + Math.random().toString(36).slice(2, 8),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: 'gpt-4o',
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content,
          refusal: null,
        },
        finish_reason: 'stop',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  }
}

/** Helper que crea una respuesta OpenAI simulada con finish_reason "tool_calls". */
function openAiToolCallResponse(
  toolCalls: Array<{
    id: string
    name: string
    arguments: string
  }>,
  model = 'gpt-4o',
): OpenAI.Chat.Completions.ChatCompletion {
  return {
    id: 'chatcmpl-' + Math.random().toString(36).slice(2, 8),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          refusal: null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          })),
        },
        finish_reason: 'tool_calls',
        logprobs: null,
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
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

describe('OpenAiClient', () => {
  let client: LlmClientPort
  let handler: ToolCallHandler

  beforeEach(() => {
    vi.clearAllMocks()
    client = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    })
    handler = vi.fn()
  })

  // ── Escenario: Respuesta texto directa (sin tool calling) ──

  it('should return text response without tool calls when OpenAI responds with finish_reason stop', async () => {
    mockCreate.mockResolvedValueOnce(
      openAiTextResponse('El diagnostico indica fallo en el sensor MAF.'),
    )

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico experto.',
      userMessage: 'RPM 0, coolant 95C, DTC P0101',
      tools: [],
      handler,
    })

    expect(result.text).toBe('El diagnostico indica fallo en el sensor MAF.')
    expect(result.toolCalls).toEqual([])
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  // ── Escenario: Tool calling simple (1 iteracion) ──

  it('should execute tool and return final text after tool_calls then stop', async () => {
    const mockToolCall = openAiToolCallResponse([
      { id: 'call_001', name: 'read_pid', arguments: '{"mode":"01","pid":"0C"}' },
    ])
    const mockStop = openAiTextResponse('RPM: 800 — normal.')

    mockCreate.mockResolvedValueOnce(mockToolCall).mockResolvedValueOnce(mockStop)

    const mockHandler = vi.fn().mockResolvedValue('RPM value: 800')

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico experto.',
      userMessage: 'Dame RPM',
      tools: [sampleToolDef],
      handler: mockHandler,
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockHandler).toHaveBeenCalledTimes(1)
    expect(mockHandler).toHaveBeenCalledWith('read_pid', { mode: '01', pid: '0C' })
    expect(result.text).toBe('RPM: 800 — normal.')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[0].args).toEqual({ mode: '01', pid: '0C' })
    expect(result.toolCalls[0].result).toBe('RPM value: 800')
  })

  // ── Escenario: Tool calling multiple (3 iteraciones) ──

  it('should handle multiple tool calls across iterations', async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiToolCallResponse([
          { id: 'call_001', name: 'read_pid', arguments: '{"mode":"01","pid":"0C"}' },
        ]),
      )
      .mockResolvedValueOnce(
        openAiToolCallResponse([{ id: 'call_002', name: 'get_dtc_codes', arguments: '{}' }]),
      )
      .mockResolvedValueOnce(
        openAiToolCallResponse([{ id: 'call_003', name: 'read_vin', arguments: '{}' }]),
      )
      .mockResolvedValueOnce(openAiTextResponse('Diagnostico completo.'))

    const mockHandler = vi
      .fn()
      .mockResolvedValueOnce('RPM: 800')
      .mockResolvedValueOnce('DTCs: P0101, P0302')
      .mockResolvedValueOnce('VIN: WAUZZZ8X')

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico experto.',
      userMessage: 'Diagnostico completo',
      tools: [
        sampleToolDef,
        { name: 'get_dtc_codes', description: 'Get DTCs', schema: {} as Record<string, unknown> },
        { name: 'read_vin', description: 'Read VIN', schema: {} as Record<string, unknown> },
      ],
      handler: mockHandler,
    })

    expect(mockCreate).toHaveBeenCalledTimes(4)
    expect(mockHandler).toHaveBeenCalledTimes(3)
    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[1].tool).toBe('get_dtc_codes')
    expect(result.toolCalls[2].tool).toBe('read_vin')
    expect(result.text).toBe('Diagnostico completo.')
  })

  // ── Escenario: Tool handler lanza error → contenido de error ──

  it('should report tool errors as error content and continue the loop', async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiToolCallResponse([
          { id: 'call_001', name: 'read_pid', arguments: '{"mode":"01","pid":"0C"}' },
        ]),
      )
      .mockResolvedValueOnce(
        openAiTextResponse('No pude leer el PID, pero el fallo parece ser electrico.'),
      )

    const mockHandler = vi.fn().mockRejectedValue(new Error('OBD timeout'))

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico experto.',
      userMessage: 'Diagnostico',
      tools: [sampleToolDef],
      handler: mockHandler,
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].result).toBe('Tool execution failed: read_pid')
    expect(result.text).toContain('No pude leer el PID')
  })

  // ── Escenario: Tool desconocida → error reportado ──

  it('should report unknown tool as error content and continue', async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiToolCallResponse([{ id: 'call_001', name: 'unknown_tool', arguments: '{}' }]),
      )
      .mockResolvedValueOnce(openAiTextResponse('Intentare con otra herramienta.'))

    const mockHandler = vi.fn()

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico experto.',
      userMessage: 'Diagnostico',
      tools: [sampleToolDef], // solo read_pid registrada
      handler: mockHandler,
    })

    expect(mockHandler).not.toHaveBeenCalled()
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('unknown_tool')
    expect(result.toolCalls[0].result).toContain('Unknown tool')
  })

  // ── Escenario: Limite de iteraciones alcanzado (10 por defecto) ──

  it('should throw MaxToolCallIterationsError after default max iterations without stop', async () => {
    const toolResponses = Array.from({ length: 10 }, (_, i) =>
      openAiToolCallResponse([
        {
          id: `call_00${i}`,
          name: 'read_pid',
          arguments: '{"mode":"01","pid":"0C"}',
        },
      ]),
    )
    for (const msg of toolResponses) {
      mockCreate.mockResolvedValueOnce(msg)
    }

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    await expect(
      client.sendMessage({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
        handler: mockHandler,
      }),
    ).rejects.toThrow('Exceeded maximum tool call iterations')

    expect(mockCreate).toHaveBeenCalledTimes(10)
    expect(mockHandler).toHaveBeenCalledTimes(10)
  })

  // ── Escenario: Limite configurable ──

  it('should respect configurable maxIterations', async () => {
    const customClient = createOpenAiClient({
      apiKey: 'test-key',
      baseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      maxIterations: 3,
    })

    const toolResponses = Array.from({ length: 3 }, (_, i) =>
      openAiToolCallResponse([
        {
          id: `call_00${i}`,
          name: 'read_pid',
          arguments: '{"mode":"01","pid":"0C"}',
        },
      ]),
    )
    for (const msg of toolResponses) {
      mockCreate.mockResolvedValueOnce(msg)
    }

    const mockHandler = vi.fn().mockResolvedValue('RPM: 800')

    await expect(
      customClient.sendMessage({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
        handler: mockHandler,
      }),
    ).rejects.toThrow('maximum tool call iterations (3)')

    expect(mockCreate).toHaveBeenCalledTimes(3)
    expect(mockHandler).toHaveBeenCalledTimes(3)
  })

  // ── Escenario: Timeout de API → OpenAiTimeoutError ──

  it('should throw OpenAiTimeoutError when SDK throws timeout', async () => {
    const timeoutErr = new Error('Connection timed out')
    timeoutErr.name = 'APIConnectionTimeoutError'
    mockCreate.mockRejectedValue(timeoutErr)

    await expect(
      client.sendMessage({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [],
        handler,
      }),
    ).rejects.toThrow(OpenAiTimeoutError)
  })

  // ── Escenario: Error de API (4xx/5xx) → OpenAiApiError ──

  it('should throw OpenAiApiError when SDK throws API error', async () => {
    mockCreate.mockRejectedValue(new Error('401 Unauthorized'))

    await expect(
      client.sendMessage({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [],
        handler,
      }),
    ).rejects.toThrow(OpenAiApiError)
  })

  // ── Escenario: Sanitizacion de errores (no expone mensajes crudos) ──

  it('should NOT expose raw SDK error message in OpenAiApiError', async () => {
    mockCreate.mockRejectedValue(new Error('Sensitive internal details'))

    try {
      await client.sendMessage({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [],
        handler,
      })
      expect.fail('Expected an error to be thrown')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OpenAiApiError)
      expect((error as Error).message).not.toContain('Sensitive')
      expect((error as Error).message).not.toContain('internal')
      expect((error as Error).message).not.toContain('details')
    }
  })

  // ── Escenario: finish_reason "length" → devuelve el texto parcial ──

  it('should return partial text when finish_reason is "length"', async () => {
    const lengthResponse: OpenAI.Chat.Completions.ChatCompletion = {
      id: 'chatcmpl-abc',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Diagnostico truncado...',
            refusal: null,
          },
          finish_reason: 'length',
          logprobs: null,
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    }

    mockCreate.mockResolvedValueOnce(lengthResponse)

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico',
      tools: [],
      handler,
    })

    expect(result.text).toBe('Diagnostico truncado...')
    expect(result.toolCalls).toEqual([])
  })

  // ── Escenario: Tool calls paralelas en una sola respuesta ──

  it('should handle multiple parallel tool calls in a single response', async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiToolCallResponse([
          { id: 'call_001', name: 'read_pid', arguments: '{"mode":"01","pid":"0C"}' },
          { id: 'call_002', name: 'get_dtc_codes', arguments: '{}' },
        ]),
      )
      .mockResolvedValueOnce(openAiTextResponse('Diagnostico con RPM y DTCs.'))

    const mockHandler = vi
      .fn()
      .mockResolvedValueOnce('RPM: 800')
      .mockResolvedValueOnce('DTCs: P0101')

    const result = await client.sendMessage({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico completo',
      tools: [
        sampleToolDef,
        { name: 'get_dtc_codes', description: 'Get DTCs', schema: {} as Record<string, unknown> },
      ],
      handler: mockHandler,
    })

    expect(mockCreate).toHaveBeenCalledTimes(2)
    expect(mockHandler).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(2)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[1].tool).toBe('get_dtc_codes')
    expect(result.text).toBe('Diagnostico con RPM y DTCs.')
  })

  // ── Escenario: Arguments que necesitan JSON.parse ──

  it('should JSON.parse tool call arguments correctly', async () => {
    mockCreate
      .mockResolvedValueOnce(
        openAiToolCallResponse([
          {
            id: 'call_001',
            name: 'read_pid',
            arguments: '{"mode":"01","pid":"0C","options":{"raw":true}}',
          },
        ]),
      )
      .mockResolvedValueOnce(openAiTextResponse('OK'))

    const mockHandler = vi.fn().mockResolvedValue('Parsed')

    await client.sendMessage({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico',
      tools: [sampleToolDef],
      handler: mockHandler,
    })

    expect(mockHandler).toHaveBeenCalledWith('read_pid', {
      mode: '01',
      pid: '0C',
      options: { raw: true },
    })
  })

  // ── Escenario: Configuracion provider-agnostic (baseURL y model custom) ──

  it('should use configurable baseURL and model when provided', async () => {
    const { default: MockedOpenAI } = await import('openai')
    vi.clearAllMocks()

    createOpenAiClient({
      apiKey: 'sk-test',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
    })

    expect(MockedOpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'sk-test',
        baseURL: 'https://api.deepseek.com/v1',
      }),
    )
  })

  // ── Escenario: Zod rechaza config sin baseURL ni model ──

  it('should throw ZodError when baseURL is missing', () => {
    expect(() =>
      createOpenAiClient({ apiKey: 'sk-test', baseURL: '' as unknown as string, model: 'gpt-4o' }),
    ).toThrow()
  })

  it('should throw ZodError when model is missing', () => {
    expect(() =>
      createOpenAiClient({
        apiKey: 'sk-test',
        baseURL: 'https://api.openai.com/v1',
        model: '' as unknown as string,
      }),
    ).toThrow()
  })
})
