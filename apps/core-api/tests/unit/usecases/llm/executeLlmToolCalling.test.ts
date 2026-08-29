import { describe, it, expect, vi } from 'vitest'
import {
  ExecuteLlmToolCalling,
  type LlmSingleMessageSender,
} from '@/application/use-cases/ExecuteLlmToolCalling.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/** Tool definition de ejemplo. */
const sampleToolDef = {
  name: 'read_pid',
  description: 'Read OBD-II PID',
  schema: {
    type: 'object',
    properties: { mode: { type: 'string' }, pid: { type: 'string' } },
  } as Record<string, unknown>,
}

/** Helper: crea un mock de LoggerPort con spies para cada nivel. */
function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/** Helper: crea una respuesta single de texto. */
function textSingleResponse(text: string, raw: unknown = {}): LlmSingleResponse {
  return { text, toolCalls: [], raw }
}

/** Helper: crea una respuesta single con tool calls. */
function toolCallsSingleResponse(
  calls: ReadonlyArray<{ name: string; args: Record<string, unknown>; id: string }>,
  raw: unknown = {},
): LlmSingleResponse {
  return { text: null, toolCalls: calls, raw }
}

describe('ExecuteLlmToolCalling', () => {
  // ── Respuesta de texto directa (sin tool calling) ──

  it('should return text response on first call when LLM responds with text', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValue(textSingleResponse('Diagnostico completo.'))
    const handler: ToolCallHandlerPort = vi.fn()
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [],
      },
      handler,
    )

    expect(result.text).toBe('Diagnostico completo.')
    expect(result.toolCalls).toEqual([])
    expect(mockSendSingle).toHaveBeenCalledTimes(1)
    expect(handler).not.toHaveBeenCalled()
  })

  // ── Tool calling: una iteracion ──

  it('should execute tool and return final text after tool call then text response', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(
        toolCallsSingleResponse([
          { name: 'read_pid', args: { mode: '01', pid: '0C' }, id: 'call_1' },
        ]),
      )
      .mockResolvedValueOnce(textSingleResponse('RPM: 800 — normal.'))

    const mockHandler = vi.fn<ToolCallHandlerPort>().mockResolvedValue('RPM value: 800')
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Dame RPM',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(mockSendSingle).toHaveBeenCalledTimes(2)
    expect(mockHandler).toHaveBeenCalledTimes(1)
    expect(mockHandler).toHaveBeenCalledWith('read_pid', { mode: '01', pid: '0C' })
    expect(result.text).toBe('RPM: 800 — normal.')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[0].args).toEqual({ mode: '01', pid: '0C' })
    expect(result.toolCalls[0].result).toBe('RPM value: 800')

    // Verificar que conversationHistory se paso en la segunda llamada
    const secondCallInput = mockSendSingle.mock.calls[1][0]
    expect(secondCallInput.conversationHistory).toBeDefined()
    expect(secondCallInput.conversationHistory!.length).toBe(3) // user_message + raw_response + tool_result
  })

  // ── Tool calling: multiples iteraciones ──

  it('should seed conversationHistory from input when provided', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(textSingleResponse('Diagnostico completo.'))

    const mockHandler = vi.fn<ToolCallHandlerPort>()
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const priorHistory = [
      { __type: 'user_message' as const, content: '¿Por qué tiembla el motor?' },
      { __type: 'raw_response' as const, data: { text: 'Es un fallo de encendido.' } },
    ]

    await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: '¿Y eso por qué?',
        tools: [],
        conversationHistory: priorHistory,
      },
      mockHandler,
    )

    const callInput = mockSendSingle.mock.calls[0][0]
    expect(callInput.conversationHistory).toBeDefined()
    expect(callInput.conversationHistory!.length).toBe(3) // prior 2 + user_message nuevo
    expect(callInput.conversationHistory![0]).toEqual(priorHistory[0])
    expect(callInput.conversationHistory![1]).toEqual(priorHistory[1])
    expect(callInput.conversationHistory![2]).toEqual({
      __type: 'user_message',
      content: '¿Y eso por qué?',
    })
  })

  it('should handle multiple tool calls across iterations', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'read_pid', args: { mode: '01', pid: '0C' }, id: 'c1' }]),
      )
      .mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'get_dtc_codes', args: {}, id: 'c2' }]),
      )
      .mockResolvedValueOnce(toolCallsSingleResponse([{ name: 'read_vin', args: {}, id: 'c3' }]))
      .mockResolvedValueOnce(textSingleResponse('Diagnostico completo.'))

    const mockHandler = vi
      .fn<ToolCallHandlerPort>()
      .mockResolvedValueOnce('RPM: 800')
      .mockResolvedValueOnce('DTCs: P0101, P0302')
      .mockResolvedValueOnce('VIN: WAUZZZ8X')
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico completo',
        tools: [
          sampleToolDef,
          { name: 'get_dtc_codes', description: 'Get DTCs', schema: {} as Record<string, unknown> },
          { name: 'read_vin', description: 'Read VIN', schema: {} as Record<string, unknown> },
        ],
      },
      mockHandler,
    )

    expect(mockSendSingle).toHaveBeenCalledTimes(4)
    expect(mockHandler).toHaveBeenCalledTimes(3)
    expect(result.toolCalls).toHaveLength(3)
    expect(result.toolCalls[0].tool).toBe('read_pid')
    expect(result.toolCalls[1].tool).toBe('get_dtc_codes')
    expect(result.toolCalls[2].tool).toBe('read_vin')
    expect(result.text).toBe('Diagnostico completo.')
  })

  // ── Tool handler lanza error ──

  it('should report tool errors and continue the loop', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'read_pid', args: { mode: '01', pid: '0C' }, id: 'c1' }]),
      )
      .mockResolvedValueOnce(textSingleResponse('No pude leer el PID.'))

    const mockHandler = vi.fn<ToolCallHandlerPort>().mockRejectedValue(new Error('OBD timeout'))
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(mockSendSingle).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].result).toBe('Tool execution failed: read_pid — OBD timeout')
    expect(result.text).toContain('No pude leer el PID')
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.stringContaining("Tool handler error for 'read_pid'"),
      expect.objectContaining({ stack: expect.any(String) }),
    )
  })

  // ── Tool desconocida ──

  it('should report unknown tool as error and continue', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'unknown_tool', args: {}, id: 'c1' }]),
      )
      .mockResolvedValueOnce(textSingleResponse('Intentare con otra herramienta.'))

    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 10)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef], // solo read_pid registrada
      },
      vi.fn(),
    )

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('unknown_tool')
    expect(result.toolCalls[0].result).toContain('Unknown tool')
  })

  // ── Limite de iteraciones (por defecto 20): degradacion, no error, si hay progreso ──

  it('should force a final answer without tools after exhausting max iterations, instead of throwing, when the model keeps making progress', async () => {
    const mockSendSingle = vi.fn<LlmSingleMessageSender>()
    // 3 tool calls con argumentos distintos: progreso real, no un bucle.
    const pids = ['0C', '0D', '05']
    for (const pid of pids) {
      mockSendSingle.mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'read_pid', args: { mode: '01', pid }, id: pid }]),
      )
    }
    // La llamada forzada final, sin tools, es la que por fin trae texto.
    mockSendSingle.mockResolvedValueOnce(textSingleResponse('Diagnóstico con lo reunido.'))
    const mockHandler = vi.fn<ToolCallHandlerPort>().mockResolvedValue('valor')
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 3)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(result.text).toBe('Diagnóstico con lo reunido.')
    expect(result.toolCalls).toHaveLength(3)
    // 3 iteraciones normales + 1 llamada forzada final = 4.
    expect(mockSendSingle).toHaveBeenCalledTimes(4)
    const finalCallInput = mockSendSingle.mock.calls[3][0]
    expect(finalCallInput.tools).toEqual([])
  })

  it('should still throw MaxToolCallIterationsError if the forced final call also comes back without text', async () => {
    const mockSendSingle = vi.fn<LlmSingleMessageSender>()
    const pids = ['0C', '0D', '05']
    for (const pid of pids) {
      mockSendSingle.mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'read_pid', args: { mode: '01', pid }, id: pid }]),
      )
    }
    // La llamada forzada final tambien viene sin texto: caso limite, no debe pasar en la
    // practica (sin tools el proveedor no puede devolver tool_use), pero hay que cubrirlo.
    mockSendSingle.mockResolvedValueOnce(
      toolCallsSingleResponse([
        { name: 'read_pid', args: { mode: '01', pid: 'no-tools' }, id: 'x' },
      ]),
    )
    const mockHandler = vi.fn<ToolCallHandlerPort>().mockResolvedValue('valor')
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, createMockLogger(), 3)

    await expect(
      useCase.execute(
        { systemPrompt: 'Eres un mecanico.', userMessage: 'Diagnostico', tools: [sampleToolDef] },
        mockHandler,
      ),
    ).rejects.toThrow(MaxToolCallIterationsError)
  })

  // ── La misma tool con los mismos argumentos, repetida: se tolera ──

  it('should tolerate the model repeating the exact same tool call more than twice, without throwing early', async () => {
    // Visto contra un modelo real en la bateria de eval: releer el mismo PID no
    // siempre es un atasco. Una version anterior cortaba aqui al tercer repetido y
    // eso rompia sesiones que iban bien — se quito esa deteccion (ver el comentario
    // en `ExecuteLlmToolCalling.execute`).
    const mockSendSingle = vi.fn<LlmSingleMessageSender>()
    for (let i = 0; i < 5; i++) {
      mockSendSingle.mockResolvedValueOnce(
        toolCallsSingleResponse([
          { name: 'read_pid', args: { mode: '01', pid: '0C' }, id: `c${i}` },
        ]),
      )
    }
    mockSendSingle.mockResolvedValueOnce(textSingleResponse('Diagnóstico con lo reunido.'))
    const mockHandler = vi.fn<ToolCallHandlerPort>().mockResolvedValue('RPM: 800')
    const mockLogger = createMockLogger()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, mockLogger, 5)

    const result = await useCase.execute(
      {
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
      },
      mockHandler,
    )

    expect(result.text).toBe('Diagnóstico con lo reunido.')
    expect(result.toolCalls).toHaveLength(5)
    expect(mockHandler).toHaveBeenCalledTimes(5)
  })
})
