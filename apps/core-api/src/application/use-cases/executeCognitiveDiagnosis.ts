import { z } from 'zod'
import { Severity } from '@/domain/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'
import type { CognitiveDiagnosisResult, ExecuteCognitiveDiagnosisInput } from '@/application/ports/cognitiveDiagnosis.port.js'

const SEVERITY_LABELS: Record<Severity, string> = {
  [Severity.Low]: 'low',
  [Severity.Medium]: 'medium',
  [Severity.High]: 'high',
  [Severity.Critical]: 'critical',
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
  `{"severity": "${Object.values(SEVERITY_LABELS).join('|')}", "confidence": 0.0-1.0, "recommendations": ["acción", "..."]}`,
  'El bloque debe terminar con ---.',
].join('\n')

/**
 * Extrae el bloque JSON de la respuesta del LLM.
 * Tolerante a variaciones: `---JSON---{...}---` (prompt), `---JSON\n{...}\n---` (DeepSeek real).
 */
const JSON_BLOCK_REGEX = /---JSON[-\s]*([\s\S]*?)\s*---/

const FALLBACK_SEVERITY = Severity.Medium
const FALLBACK_CONFIDENCE = 0.5
const FALLBACK_RECOMMENDATIONS: string[] = []

/** Schema Zod del bloque JSON que el LLM debe devolver tras la narrativa. */
export const cognitiveDiagnosisJsonSchema = z.object({
  severity: z.nativeEnum(Severity),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
})

type ParsedCognitiveDiagnosis = z.infer<typeof cognitiveDiagnosisJsonSchema>

function fallbackDiagnosis(): ParsedCognitiveDiagnosis {
  return {
    severity: FALLBACK_SEVERITY,
    confidence: FALLBACK_CONFIDENCE,
    recommendations: FALLBACK_RECOMMENDATIONS,
  }
}

/**
 * Parsea el bloque `---JSON---` de la narrativa del LLM y valida con Zod.
 * Aplica fallback si el bloque falta, es inválido o no cumple el schema.
 */
function parseCognitiveDiagnosis(text: string): ParsedCognitiveDiagnosis {
  const match = JSON_BLOCK_REGEX.exec(text)
  if (!match) return fallbackDiagnosis()
  try {
    const parsed = cognitiveDiagnosisJsonSchema.safeParse(JSON.parse(match[1]))
    return parsed.success ? parsed.data : fallbackDiagnosis()
  } catch {
    return fallbackDiagnosis()
  }
}

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
