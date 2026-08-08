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
})
