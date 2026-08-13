import { z } from 'zod'
import { Severity } from '@/domain/value-objects/diagnosisResult.js'

/**
 * Extrae el bloque JSON de la respuesta del LLM.
 *
 * Tolerante a variaciones: `---JSON---{...}---` (prompt), `---JSON\n{...}\n---`
 * (DeepSeek real) y **sin el `---` de cierre**, que el modelo omite a veces.
 * Cuando faltaba el cierre, el `replace` no borraba nada y el JSON crudo acababa
 * en la cara del mecanico, ademas de caer al fallback silencioso.
 */
export const JSON_BLOCK_REGEX = /---JSON[-\s]*([\s\S]*?)(?:\s*---|\s*$)/

const FALLBACK_SEVERITY = Severity.Medium
const FALLBACK_CONFIDENCE = 0.5
const FALLBACK_RECOMMENDATIONS: string[] = []

/** Tope de recomendaciones que el prompt pide y que aqui SI se impone. */
export const MAX_RECOMMENDATIONS = 5

/** Schema Zod del bloque JSON que el LLM debe devolver tras la narrativa. */
export const cognitiveDiagnosisJsonSchema = z.object({
  severity: z.nativeEnum(Severity),
  confidence: z.number().min(0).max(1),
  recommendations: z.array(z.string()),
})

/** Diagnóstico estructurado extraído del bloque JSON de la narrativa del LLM. */
export type ParsedCognitiveDiagnosis = z.infer<typeof cognitiveDiagnosisJsonSchema>

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
export function parseCognitiveDiagnosis(text: string): ParsedCognitiveDiagnosis {
  const match = JSON_BLOCK_REGEX.exec(text)
  if (!match) return fallbackDiagnosis()
  try {
    const parsed = cognitiveDiagnosisJsonSchema.safeParse(JSON.parse(match[1]))
    if (!parsed.success) return fallbackDiagnosis()
    // El prompt pide un maximo de 5; nadie lo comprobaba.
    return {
      ...parsed.data,
      recommendations: parsed.data.recommendations.slice(0, MAX_RECOMMENDATIONS),
    }
  } catch {
    return fallbackDiagnosis()
  }
}
