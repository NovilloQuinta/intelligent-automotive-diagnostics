import { describe, it, expect, vi } from 'vitest'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'

const testLogger: LoggerPort = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('ExecuteCognitiveDiagnosisUseCase', () => {
  it('should strip ---JSON--- block from diagnosis text in output', async () => {
    const rawText =
      'Diagnóstico narrativo del coche.\n\n' +
      '---JSON---{"severity":"medium","confidence":0.75,"recommendations":["revisar sensor"]}---'

    const mockLlmClient: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue({
        text: rawText,
        toolCalls: [] as readonly ToolCallTrace[],
      }),
      sendSingleMessage: vi.fn(),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: mockLlmClient,
      tools: [],
      handler: vi.fn<ToolCallHandler>(),
      logger: testLogger,
    })

    const result = await useCase.execute({ userQuery: '¿Qué falla?' })

    expect(result.diagnosis).not.toContain('---JSON---')
    expect(result.diagnosis).not.toContain('"severity"')
    expect(result.diagnosis).not.toContain('"confidence"')
    expect(result.diagnosis).not.toContain('"recommendations"')
    expect(result.diagnosis).toBe('Diagnóstico narrativo del coche.')
    expect(result.severity).toBe('medium')
    expect(result.confidence).toBe(0.75)
    expect(result.recommendations).toEqual(['revisar sensor'])
  })

  it('should instruct the LLM to index unknown PIDs via index_pid in the system prompt', async () => {
    const rawText =
      'Diagnóstico narrativo.\n\n' +
      '---JSON---{"severity":"low","confidence":0.5,"recommendations":["ninguna"]}---'

    const mockLlmClient: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue({
        text: rawText,
        toolCalls: [] as readonly ToolCallTrace[],
      }),
      sendSingleMessage: vi.fn(),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: mockLlmClient,
      tools: [],
      handler: vi.fn<ToolCallHandler>(),
      logger: testLogger,
    })

    await useCase.execute({ userQuery: '¿Qué falla?' })

    const callArgs = (mockLlmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.systemPrompt).toContain('index_pid')
    expect(callArgs.systemPrompt).toContain('source')
  })

  it('should instruct the LLM to answer concisely with actionable steps for a mechanic', async () => {
    const rawText =
      'Diagnóstico narrativo.\n\n' +
      '---JSON---{"severity":"low","confidence":0.5,"recommendations":["ninguna"]}---'

    const mockLlmClient: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue({
        text: rawText,
        toolCalls: [] as readonly ToolCallTrace[],
      }),
      sendSingleMessage: vi.fn(),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: mockLlmClient,
      tools: [],
      handler: vi.fn<ToolCallHandler>(),
      logger: testLogger,
    })

    await useCase.execute({ userQuery: '¿Qué falla?' })

    const callArgs = (mockLlmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArgs.systemPrompt.toLowerCase()).toContain('concisa')
    expect(callArgs.systemPrompt.toLowerCase()).toContain('mecánico')
    expect(callArgs.systemPrompt).toContain('~200 palabras')
    expect(callArgs.systemPrompt).toContain('Máximo 5 recomendaciones')
  })

  it('should keep parsing the ---JSON--- block correctly with the extended prompt (regression)', async () => {
    const rawText =
      'Narrativa con pasos accionables.\n\n' +
      '---JSON---{"severity":"high","confidence":0.85,"recommendations":["a","b"]}---'

    const mockLlmClient: LlmClientPort = {
      sendMessage: vi.fn().mockResolvedValue({
        text: rawText,
        toolCalls: [] as readonly ToolCallTrace[],
      }),
      sendSingleMessage: vi.fn(),
    }

    const useCase = new ExecuteCognitiveDiagnosisUseCase({
      llmClient: mockLlmClient,
      tools: [],
      handler: vi.fn<ToolCallHandler>(),
      logger: testLogger,
    })

    const result = await useCase.execute({ userQuery: '¿Qué falla?' })

    expect(result.diagnosis).toBe('Narrativa con pasos accionables.')
    expect(result.severity).toBe('high')
    expect(result.confidence).toBe(0.85)
    expect(result.recommendations).toEqual(['a', 'b'])
  })
})
