import { describe, it, expect } from 'vitest'
import {
  cognitiveDiagnosisJsonSchema,
  parseCognitiveDiagnosis,
} from '@/application/llm/extractLlmDiagnosis.js'
import { Severity } from '@/domain/value-objects/DiagnosisResult.js'

describe('extractLlmDiagnosis', () => {
  it('should parse a valid inline ---JSON--- block', () => {
    const text =
      'Narrativa. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'

    const parsed = parseCognitiveDiagnosis(text)

    expect(parsed).toEqual({
      severity: Severity.High,
      confidence: 0.9,
      recommendations: ['Revisar bujías', 'Cambiar bobina'],
    })
  })

  it('should parse the ---JSON\\n variant (DeepSeek real format with newline separator)', () => {
    const text =
      'Narrativa.\n---JSON\n{"severity":"critical","confidence":0.78,"recommendations":["Verificar compresión"]}\n---'

    const parsed = parseCognitiveDiagnosis(text)

    expect(parsed.severity).toBe(Severity.Critical)
    expect(parsed.confidence).toBe(0.78)
    expect(parsed.recommendations).toEqual(['Verificar compresión'])
  })

  it('should return the fallback when the text has no JSON block', () => {
    const parsed = parseCognitiveDiagnosis('Diagnóstico plano sin bloque estructurado.')

    expect(parsed).toEqual({
      severity: Severity.Medium,
      confidence: 0.5,
      recommendations: [],
    })
  })

  it('should return the fallback when the JSON block is malformed', () => {
    const parsed = parseCognitiveDiagnosis('Narrativa. ---JSON---{"severity": }---')

    expect(parsed).toEqual({
      severity: Severity.Medium,
      confidence: 0.5,
      recommendations: [],
    })
  })

  it('should return the fallback when confidence is out of range', () => {
    const parsed = parseCognitiveDiagnosis(
      '---JSON---{"severity":"high","confidence":2,"recommendations":["x"]}---',
    )

    expect(parsed).toEqual({
      severity: Severity.Medium,
      confidence: 0.5,
      recommendations: [],
    })
  })

  it('should return the fallback when severity is invalid', () => {
    const parsed = parseCognitiveDiagnosis(
      '---JSON---{"severity":"urgent","confidence":0.8,"recommendations":["x"]}---',
    )

    expect(parsed).toEqual({
      severity: Severity.Medium,
      confidence: 0.5,
      recommendations: [],
    })
  })

  it('should export a schema that validates the expected LLM shape', () => {
    const valid = cognitiveDiagnosisJsonSchema.safeParse({
      severity: 'high',
      confidence: 0.9,
      recommendations: ['Revisar bujías'],
    })
    const invalid = cognitiveDiagnosisJsonSchema.safeParse({
      severity: 'high',
      confidence: 2,
      recommendations: 'not-an-array',
    })

    expect(valid.success).toBe(true)
    expect(invalid.success).toBe(false)
  })
})
