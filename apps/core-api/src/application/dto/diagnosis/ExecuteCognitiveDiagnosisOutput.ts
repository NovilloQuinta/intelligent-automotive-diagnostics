import type { Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import type { PidObservation } from '@/application/dto/diagnosis/PidObservation.js'

/** Output del caso de uso de diagnostico cognitivo. */
export interface ExecuteCognitiveDiagnosisOutput {
  readonly diagnosis: string
  readonly severity: Severity
  readonly confidence: number
  readonly recommendations: string[]
  readonly toolCalls: readonly ToolCallTrace[]
  /** Lecturas de PID enriquecidas derivadas de las llamadas `read_pid` de la sesion. */
  readonly pidObservations: readonly PidObservation[]
}
