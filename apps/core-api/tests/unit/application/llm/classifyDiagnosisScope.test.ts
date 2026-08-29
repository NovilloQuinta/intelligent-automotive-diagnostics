import { describe, it, expect, vi } from 'vitest'
import { classifyDiagnosisScope } from '@/application/llm/classifyDiagnosisScope.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'

function llmClientWith(text: string | null): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    sendSingleMessage: vi.fn().mockResolvedValue({ text, toolCalls: [], raw: null }),
  }
}

describe('classifyDiagnosisScope', () => {
  it('returns "vehiculo" without calling the LLM when there is no query (diagnóstico general)', async () => {
    const llmClient = llmClientWith('FUERA_DE_AMBITO')

    const scope = await classifyDiagnosisScope(undefined, llmClient)

    expect(scope).toBe('vehiculo')
    expect(llmClient.sendSingleMessage).not.toHaveBeenCalled()
  })

  it('returns "vehiculo" for a blank query without calling the LLM', async () => {
    const llmClient = llmClientWith('FUERA_DE_AMBITO')

    const scope = await classifyDiagnosisScope('   ', llmClient)

    expect(scope).toBe('vehiculo')
    expect(llmClient.sendSingleMessage).not.toHaveBeenCalled()
  })

  it('calls sendSingleMessage with no tools and returns "fuera_de_ambito" on that label', async () => {
    const llmClient = llmClientWith('FUERA_DE_AMBITO')

    const scope = await classifyDiagnosisScope('Dame una receta', llmClient)

    expect(scope).toBe('fuera_de_ambito')
    const input = (llmClient.sendSingleMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.tools).toEqual([])
    expect(input.userMessage).toBe('Dame una receta')
  })

  it('returns "salud" on that label', async () => {
    const llmClient = llmClientWith('SALUD')

    const scope = await classifyDiagnosisScope('Me duele el pecho', llmClient)

    expect(scope).toBe('salud')
  })

  it('returns "vehiculo" on that label', async () => {
    const llmClient = llmClientWith('VEHICULO')

    const scope = await classifyDiagnosisScope('Tengo el P0301', llmClient)

    expect(scope).toBe('vehiculo')
  })

  it('returns "valoracion" on that label', async () => {
    const llmClient = llmClientWith('VALORACION')

    const scope = await classifyDiagnosisScope('¿Cuánto vale mi coche?', llmClient)

    expect(scope).toBe('valoracion')
  })

  it('fails open to "vehiculo" on an unrecognized or empty label', async () => {
    const llmClient = llmClientWith('  ')

    const scope = await classifyDiagnosisScope('algo ambiguo', llmClient)

    expect(scope).toBe('vehiculo')
  })

  it('fails open to "vehiculo" when the classifier call itself throws', async () => {
    const llmClient: LlmClientPort = {
      sendMessage: vi.fn(),
      sendSingleMessage: vi.fn().mockRejectedValue(new Error('timeout')),
    }

    const scope = await classifyDiagnosisScope('cualquier cosa', llmClient)

    expect(scope).toBe('vehiculo')
  })
})
