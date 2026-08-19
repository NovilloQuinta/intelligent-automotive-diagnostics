import type { SessionResultSnapshot } from '@/application/ports/VehicleRepository.js'
import type { SessionSeverity } from '@/domain/entities/DiagnosisSession.js'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import {
  GET_DTC_CODES_TOOL,
  buildConversationTurn,
  type ConversationTurn,
} from '@/infrastructure/services/diagnosisTypes.js'

/**
 * Construccion del snapshot que se persiste en `result_json` de una sesion.
 *
 * Son funciones libres y no metodos de `DiagnosisService` porque no dependen de
 * su estado: solo del `VehicleInfo`, el resultado del diagnostico y (para avisar
 * de un JSON corrupto) un logger. Sacarlas deja el servicio con la orquestacion
 * y permite probarlas sin montar el servicio entero.
 */

/** Cuenta DTCs unicos extraidos de las tool calls {@link GET_DTC_CODES_TOOL}. */
export function countDtcsFromToolCalls(
  toolCalls?: ReadonlyArray<{ readonly tool: string; readonly result: string }>,
): number {
  if (!toolCalls) return 0
  const dtcToolResult = toolCalls.find((t) => t.tool === GET_DTC_CODES_TOOL)?.result
  if (!dtcToolResult) return 0
  // El resultado es tipo "P0301: Cylinder 1 Misfire, P0420: Catalyst..."
  return dtcToolResult.split(',').filter((s) => /[A-Z]\d{4}/.test(s.trim())).length
}

/**
 * Recupera los turnos de conversación de un `result_json` previo.
 *
 * Devuelve `[]` si no hay snapshot previo o si el JSON no es parseable, de modo
 * que un follow-up sobre una sesión sin conversación no rompe el diagnóstico.
 */
export function parseConversation(
  resultJson: string | undefined,
  logger: LoggerPort,
): ConversationTurn[] {
  if (!resultJson) return []
  try {
    const parsed = JSON.parse(resultJson) as { conversation?: ConversationTurn[] }
    return Array.isArray(parsed.conversation) ? parsed.conversation : []
  } catch {
    logger.warn('Failed to parse previous diagnosis snapshot conversation')
    return []
  }
}

/** Serializa el snapshot inmutable con la conversación dada. */
export function buildSnapshot(
  vehicleInfo: VehicleInfo,
  diagnosis: ExecuteCognitiveDiagnosisOutput,
  conversation: ConversationTurn[],
): SessionResultSnapshot {
  const dtcCount = countDtcsFromToolCalls(diagnosis.toolCalls)
  const severity: SessionSeverity = (diagnosis.severity as SessionSeverity) ?? 'low'

  const snapshot = {
    vehicle: {
      vin: vehicleInfo.vin.value,
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      year: vehicleInfo.year,
      engineType: vehicleInfo.engineType,
    },
    diagnosis: {
      severity: diagnosis.severity,
      confidence: diagnosis.confidence,
      narrative: diagnosis.diagnosis,
      recommendations: diagnosis.recommendations,
      toolCalls: diagnosis.toolCalls,
    },
    conversation,
    timestamp: new Date().toISOString(),
  }

  return {
    resultJson: JSON.stringify(snapshot),
    severity,
    dtcCount,
  }
}

/** Snapshot de un diagnostico nuevo: la conversacion arranca con la respuesta del asistente. */
export function buildDiagnosisSnapshot(
  vehicleInfo: VehicleInfo,
  diagnosis?: ExecuteCognitiveDiagnosisOutput,
): SessionResultSnapshot | null {
  if (!diagnosis) return null
  return buildSnapshot(vehicleInfo, diagnosis, [
    buildConversationTurn('assistant', diagnosis.diagnosis),
  ])
}

/**
 * Construye el snapshot de un follow-up reutilizando la conversación previa.
 *
 * Lee los turnos ya persistidos en `result_json`, añade la pregunta del mecánico
 * (si la hay) y la nueva respuesta del asistente, y serializa el snapshot completo.
 */
export function buildFollowUpSnapshot(
  vehicleInfo: VehicleInfo,
  previousResultJson: string | undefined,
  userQuery: string | undefined,
  diagnosis: ExecuteCognitiveDiagnosisOutput,
  logger: LoggerPort,
): SessionResultSnapshot {
  const turns = [...parseConversation(previousResultJson, logger)]
  if (userQuery) {
    turns.push(buildConversationTurn('user', userQuery))
  }
  turns.push(buildConversationTurn('assistant', diagnosis.diagnosis))
  return buildSnapshot(vehicleInfo, diagnosis, turns)
}
