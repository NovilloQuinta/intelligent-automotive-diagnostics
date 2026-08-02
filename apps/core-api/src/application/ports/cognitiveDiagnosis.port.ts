import type {
  LlmClientPort,
  McpToolDefinition,
  ToolCallHandler,
  ToolCallTrace,
} from '@/application/ports/llmClient.port.js'
import type { Severity } from '@/domain/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'

/** Entrada para el caso de uso de diagnóstico cognitivo. */
export interface ExecuteCognitiveDiagnosisInput {
  readonly llmClient: LlmClientPort
  readonly tools: readonly McpToolDefinition[]
  readonly handler: ToolCallHandler
  readonly userQuery?: string
  readonly vehicleContext?: VehicleInfo
}

/** Resultado de un diagnóstico cognitivo generado por un LLM vía MCP tool calling. */
export interface CognitiveDiagnosisResult {
  readonly diagnosis: string
  readonly severity: Severity
  readonly confidence: number
  readonly recommendations: string[]
  readonly toolCalls: readonly ToolCallTrace[]
}
