import { describe, it, expect, vi } from 'vitest'
import {
  ExecuteLlmToolCalling,
  type LlmSingleMessageSender,
} from '@/application/use-cases/ExecuteLlmToolCalling.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'

/** Tool definition de ejemplo. */
const sampleToolDef = {
  name: 'read_pid',
  description: 'Read OBD-II PID',
  schema: {
    type: 'object',
    properties: { mode: { type: 'string' }, pid: { type: 'string' } },
  } as Record<string, unknown>,
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
    const handler: ToolCallHandler = vi.fn()
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    const result = await useCase.execute({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico',
      tools: [],
      handler,
    })

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

    const mockHandler = vi.fn<ToolCallHandler>().mockResolvedValue('RPM value: 800')
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    const result = await useCase.execute({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Dame RPM',
      tools: [sampleToolDef],
      handler: mockHandler,
    })

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
      .fn<ToolCallHandler>()
      .mockResolvedValueOnce('RPM: 800')
      .mockResolvedValueOnce('DTCs: P0101, P0302')
      .mockResolvedValueOnce('VIN: WAUZZZ8X')
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    const result = await useCase.execute({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico completo',
      tools: [
        sampleToolDef,
        { name: 'get_dtc_codes', description: 'Get DTCs', schema: {} as Record<string, unknown> },
        { name: 'read_vin', description: 'Read VIN', schema: {} as Record<string, unknown> },
      ],
      handler: mockHandler,
    })

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

    const mockHandler = vi.fn<ToolCallHandler>().mockRejectedValue(new Error('OBD timeout'))
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    const result = await useCase.execute({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico',
      tools: [sampleToolDef],
      handler: mockHandler,
    })

    expect(mockSendSingle).toHaveBeenCalledTimes(2)
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].result).toBe('Tool execution failed: read_pid')
    expect(result.text).toContain('No pude leer el PID')
  })

  // ── Tool desconocida ──

  it('should report unknown tool as error and continue', async () => {
    const mockSendSingle = vi
      .fn<LlmSingleMessageSender>()
      .mockResolvedValueOnce(
        toolCallsSingleResponse([{ name: 'unknown_tool', args: {}, id: 'c1' }]),
      )
      .mockResolvedValueOnce(textSingleResponse('Intentare con otra herramienta.'))

    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    const result = await useCase.execute({
      systemPrompt: 'Eres un mecanico.',
      userMessage: 'Diagnostico',
      tools: [sampleToolDef], // solo read_pid registrada
      handler: vi.fn(),
    })

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0].tool).toBe('unknown_tool')
    expect(result.toolCalls[0].result).toContain('Unknown tool')
  })

  // ── Limite de iteraciones (por defecto 10) ──

  it('should throw MaxToolCallIterationsError after default max iterations without text', async () => {
    const mockSendSingle = vi.fn<LlmSingleMessageSender>()
    // 10 respuestas tool_use consecutivas
    for (let i = 0; i < 10; i++) {
      mockSendSingle.mockResolvedValueOnce(
        toolCallsSingleResponse([
          { name: 'read_pid', args: { mode: '01', pid: '0C' }, id: `c${i}` },
        ]),
      )
    }
    const mockHandler = vi.fn<ToolCallHandler>().mockResolvedValue('RPM: 800')
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 10)

    await expect(
      useCase.execute({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
        handler: mockHandler,
      }),
    ).rejects.toThrow('Exceeded maximum tool call iterations')

    expect(mockSendSingle).toHaveBeenCalledTimes(10)
    expect(mockHandler).toHaveBeenCalledTimes(10)
  })

  // ── Limite configurable ──

  it('should respect configurable maxIterations', async () => {
    const mockSendSingle = vi.fn<LlmSingleMessageSender>()
    for (let i = 0; i < 3; i++) {
      mockSendSingle.mockResolvedValueOnce(
        toolCallsSingleResponse([
          { name: 'read_pid', args: { mode: '01', pid: '0C' }, id: `c${i}` },
        ]),
      )
    }
    const mockHandler = vi.fn<ToolCallHandler>().mockResolvedValue('RPM: 800')
    const useCase = new ExecuteLlmToolCalling(mockSendSingle, 3)

    await expect(
      useCase.execute({
        systemPrompt: 'Eres un mecanico.',
        userMessage: 'Diagnostico',
        tools: [sampleToolDef],
        handler: mockHandler,
      }),
    ).rejects.toThrow('maximum tool call iterations (3)')

    expect(mockSendSingle).toHaveBeenCalledTimes(3)
    expect(mockHandler).toHaveBeenCalledTimes(3)
  })
})
