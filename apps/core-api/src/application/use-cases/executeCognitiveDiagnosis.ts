import { z } from 'zod'
import type {
  LlmClientPort,
  McpToolDefinition,
  ToolCallHandler,
  ToolCallTrace,
} from '@/application/ports/llmClient.port.js'
import { Severity } from '@/domain/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'

/** Resultado de un diagnóstico cognitivo generado por un LLM vía MCP tool calling. */
export interface CognitiveDiagnosisResult {
  /** Diagnóstico narrativo generado por el agente. */
  readonly diagnosis: string
  /** Severidad estimada por el agente. */
  readonly severity: Severity
  /** Nivel de confianza del agente en el diagnóstico (0-1). */
  readonly confidence: number
  /** Acciones recomendadas para el mecánico. */
  readonly recommendations: string[]
  /** Traza de tools ejecutadas durante el diagnóstico. */
  readonly toolCalls: readonly ToolCallTrace[]
}

/** Entrada para el caso de uso de diagnóstico cognitivo. */
export interface ExecuteCognitiveDiagnosisInput {
  /** Cliente LLM con soporte de tool calling. */
  readonly llmClient: LlmClientPort
  /** Definiciones de las tools MCP disponibles para el LLM. */
  readonly tools: readonly McpToolDefinition[]
  /** Bridge in-process que ejecuta una tool MCP (callTool + extracción de texto). */
  readonly handler: ToolCallHandler
  /** Consulta del usuario en lenguaje natural (opcional). */
  readonly userQuery?: string
  /** Contexto estático del vehículo (marca, modelo, año, motor). */
  readonly vehicleContext?: VehicleInfo
}

/** Prompt del sistema: rol experto, uso de tools y formato de salida ---JSON---. */
const COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT = [
  'Eres un diagnosticador automotriz experto con acceso a herramientas OBD-II en tiempo real.',
  'Antes de emitir un diagnóstico, explora los datos del vehículo usando las herramientas disponibles:',
  '- Lee PIDs relevantes (rpm, temperatura, velocidad) y los códigos DTC almacenados.',
  '- Consulta el freeze frame cuando existan DTCs para cruzar síntomas con valores congelados.',
  '- Usa get_vehicle_info y read_vin para identificar el vehículo.',
  'Razona la causa raíz cruzando síntomas, DTCs y freeze frame.',
  'Responde en español con un diagnóstico narrativo claro y accionable para un mecánico.',
  'Tras la narrativa, incluye un bloque ---JSON--- con esta estructura exacta:',
  '{"severity": "low|medium|high|critical", "confidence": 0.0-1.0, "recommendations": ["acción", "..."]}',
  'El bloque debe terminar con ---.',
].join('\n')

/** Delimitador que el LLM usa para incrustar el JSON estructurado en su respuesta. */
const JSON_BLOCK_REGEX = /---JSON---([\s\S]*?)---/

/** Valores por defecto cuando el bloque JSON falta o es inválido. */
const FALLBACK_SEVERITY = Severity.Medium
const FALLBACK_CONFIDENCE = 0.5
const FALLBACK_RECOMMENDATIONS: string[] = []

/** Sub-conjunto estructurado del resultado, validado con Zod. */
const CognitiveDiagnosisJsonSchema = z.object({
  severity: z.nativeEnum(Severity),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
})

interface ParsedCognitiveDiagnosis {
  readonly severity: Severity
  readonly confidence: number
  readonly recommendations: string[]
}

/** Devuelve los defaults cuando el bloque JSON no es parseable. */
function fallbackDiagnosis(): ParsedCognitiveDiagnosis {
  return {
    severity: FALLBACK_SEVERITY,
    confidence: FALLBACK_CONFIDENCE,
    recommendations: FALLBACK_RECOMMENDATIONS,
  }
}

/**
 * Extrae el bloque `---JSON---` de la narrativa del LLM y lo valida con Zod.
 * Si el bloque falta, el JSON es inválido o no cumple el schema, aplica defaults.
 *
 * @param text - Texto completo devuelto por el LLM (narrativa + bloque JSON opcional).
 * @returns Severidad, confianza y recomendaciones (con fallback si el bloque es inválido).
 */
function parseCognitiveDiagnosis(text: string): ParsedCognitiveDiagnosis {
  const match = JSON_BLOCK_REGEX.exec(text)
  if (!match) return fallbackDiagnosis()
  try {
    const parsed = CognitiveDiagnosisJsonSchema.safeParse(JSON.parse(match[1]))
    return parsed.success ? parsed.data : fallbackDiagnosis()
  } catch {
    return fallbackDiagnosis()
  }
}

/** Construye el mensaje de usuario a partir de la consulta y el contexto del vehículo. */
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
 * Orquesta una sesión de diagnóstico cognitivo: envía al LLM las definiciones
 * de las tools MCP y el bridge handler, y estructura la respuesta narrativa.
 *
 * El LLM explora los datos OBD-II vía tool calling y devuelve una narrativa
 * con un bloque ---JSON--- opcional que se parsea a severity/confidence/
 * recommendations (fallback si es inválido).
 *
 * @param input - Cliente LLM, definiciones de tools, handler bridge y contexto opcional.
 * @returns Resultado de diagnóstico cognitivo con la traza de tools ejecutadas.
 * @throws {MaxToolCallIterationsError} Si el LLM excede el límite de iteraciones.
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
