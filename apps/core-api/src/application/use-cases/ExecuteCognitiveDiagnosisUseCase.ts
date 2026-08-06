import { Severity } from '@/domain/value-objects/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { parseCognitiveDiagnosis } from '@/application/llm/extractLlmDiagnosis.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { McpToolDefinition } from '@/application/dto/McpToolDefinition.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { ExecuteCognitiveDiagnosisInput } from '@/application/dto/ExecuteCognitiveDiagnosisInput.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/ExecuteCognitiveDiagnosisOutput.js'

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

/** Caso de uso: diagnostico cognitivo via LLM + tool calling MCP. */
export class ExecuteCognitiveDiagnosisUseCase {
  constructor(
    private readonly llmClient: LlmClientPort,
    private readonly tools: readonly McpToolDefinition[],
    private readonly handler: ToolCallHandler,
  ) {}

  async execute(input: ExecuteCognitiveDiagnosisInput): Promise<ExecuteCognitiveDiagnosisOutput> {
    const { userQuery, vehicleContext } = input

    const { text, toolCalls } = await this.llmClient.sendMessage(
      {
        systemPrompt: COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT,
        userMessage: buildUserMessage(userQuery, vehicleContext),
        tools: this.tools,
      },
      this.handler,
    )

    const parsed = parseCognitiveDiagnosis(text)
    return {
      diagnosis: text,
      severity: parsed.severity,
      confidence: parsed.confidence,
      recommendations: parsed.recommendations,
      toolCalls,
    }
  }
}
