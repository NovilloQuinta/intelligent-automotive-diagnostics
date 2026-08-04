import { Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { parseCognitiveDiagnosis } from '@/application/llm/extractLlmDiagnosis.js'
import type {
  LlmClientPort,
  McpToolDefinition,
  ToolCallHandler,
  ToolCallTrace,
} from '@/application/ports/llmClient.port.js'

/** Entrada para el caso de uso de diagnostico cognitivo. */
export interface ExecuteCognitiveDiagnosisInput {
  readonly llmClient: LlmClientPort
  readonly tools: readonly McpToolDefinition[]
  readonly handler: ToolCallHandler
  readonly userQuery?: string
  readonly vehicleContext?: VehicleInfo
}

/** Resultado de un diagnostico cognitivo generado por un LLM via MCP tool calling. */
export interface CognitiveDiagnosisResult {
  readonly diagnosis: string
  readonly severity: Severity
  readonly confidence: number
  readonly recommendations: string[]
  readonly toolCalls: readonly ToolCallTrace[]
}

/** Prompt del sistema: pide explorar tools OBD-II, razonar causa raíz y devolver bloque JSON al final. */
const COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT = [
  'Eres un diagnosticador automotriz experto con acceso a herramientas OBD-II en tiempo real.',
  'Antes de emitir un diagnóstico, explora los datos del vehículo usando las herramientas disponibles:',
  '- Lee PIDs relevantes (rpm, temperatura, velocidad) y los códigos DTC almacenados.',
  '- Consulta el freeze frame cuando existan DTCs para cruzar síntomas con valores congelados.',
  '- Usa get_vehicle_info y read_vin para identificar el vehículo.',
  'Razona la causa raíz cruzando síntomas, DTCs y freeze frame.',
  'Responde en español con un diagnóstico narrativo claro y accionable para un mecánico.',
  `Tras la narrativa, incluye un bloque ---JSON--- con esta estructura exacta:`,
  `{"severity": "${Object.values(Severity).join('|')}", "confidence": 0.0-1.0, "recommendations": ["acción", "..."]}`,
  'El bloque debe terminar con ---.',
].join('\n')

function buildUserMessage(
  userQuery: string | undefined,
  vehicleContext: VehicleInfo | undefined,
): string {
  const contextLine = vehicleContext
    ? `Vehículo: ${vehicleContext.make} ${vehicleContext.model} (${vehicleContext.year}), motor ${vehicleContext.engineType}, VIN ${vehicleContext.vin}`
    : 'No se dispone de información del vehículo.'
  const queryLine = userQuery?.trim()
    ? `Consulta del usuario: ${userQuery.trim()}`
    : 'Realiza un diagnóstico general del vehículo.'
  return `${contextLine}\n${queryLine}`
}

/**
 * Orquesta diagnóstico cognitivo: tool calling LLM + parseo del bloque JSON.
 * @param input — cliente LLM, tools MCP, handler bridge y contexto opcional
 * @returns Diagnóstico narrativo con severidad, confianza, recomendaciones y traza de tools
 * @throws {MaxToolCallIterationsError} si el LLM excede el límite de iteraciones
 */
export async function executeCognitiveDiagnosis(
  input: ExecuteCognitiveDiagnosisInput,
): Promise<CognitiveDiagnosisResult> {
  const { llmClient, tools, handler, userQuery, vehicleContext } = input

  const { text, toolCalls } = await llmClient.sendMessage({
    systemPrompt: COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT,
    userMessage: buildUserMessage(userQuery, vehicleContext),
    tools,
    handler,
  })

  const parsed = parseCognitiveDiagnosis(text)
  return {
    diagnosis: text,
    severity: parsed.severity,
    confidence: parsed.confidence,
    recommendations: parsed.recommendations,
    toolCalls,
  }
}
