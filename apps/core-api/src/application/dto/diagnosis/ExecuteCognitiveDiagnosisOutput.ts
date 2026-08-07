import type { Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'

/** Output del caso de uso de diagnostico cognitivo. */
export interface ExecuteCognitiveDiagnosisOutput {
  readonly diagnosis: string
  readonly severity: Severity
  readonly confidence: number
  readonly recommendations: string[]
  readonly toolCalls: readonly ToolCallTrace[]
}
