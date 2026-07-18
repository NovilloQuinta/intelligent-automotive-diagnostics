import type { ToolCallTrace } from './toolCallTrace.js'

/** Resultado de un diagnóstico cognitivo generado por un LLM vía MCP tool calling. */
export interface CognitiveDiagnosisResult {
  /** Diagnóstico narrativo generado por el agente. */
  readonly diagnosis: string
  /** Severidad estimada por el agente. */
  readonly severity: 'low' | 'medium' | 'high' | 'critical'
  /** Nivel de confianza del agente en el diagnóstico (0-1). */
  readonly confidence: number
  /** Acciones recomendadas para el mecánico. */
  readonly recommendations: string[]
  /** Traza de tools ejecutadas durante el diagnóstico. */
  readonly toolCalls: readonly ToolCallTrace[]
}
