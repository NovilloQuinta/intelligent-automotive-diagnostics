import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import { SCOPE_CLASSIFIER_SYSTEM_PROMPT } from '@/application/prompts/scopeClassifierPrompt.js'

/**
 * Valores posibles de {@link DiagnosisScope}, nombrados para no repetir el literal
 * crudo entre este modulo y quien consume su resultado
 * (`ExecuteCognitiveDiagnosisUseCase`): un typo en una cadena suelta falla en
 * silencio en tiempo de ejecucion, no en compilacion.
 */
export const DIAGNOSIS_SCOPE = {
  Vehiculo: 'vehiculo',
  Valoracion: 'valoracion',
  IdentificacionEcu: 'identificacion_ecu',
  Salud: 'salud',
  FueraDeAmbito: 'fuera_de_ambito',
} as const

/** Resultado de clasificar el ambito de una consulta antes de entrar al flujo completo. */
export type DiagnosisScope = (typeof DIAGNOSIS_SCOPE)[keyof typeof DIAGNOSIS_SCOPE]

/**
 * Respuesta fija para una consulta fuera de ambito.
 *
 * Autorada en codigo a proposito, no generada por el LLM: la bateria de eval mostro
 * que un rechazo generado por el modelo dentro del prompt grande variaba en idioma,
 * longitud, y a veces completaba la parte fuera de ambito "de propina" pese a la
 * instruccion explicita. Esta version es identica siempre.
 */
export const OFF_TOPIC_RESPONSE =
  'Solo puedo ayudarte con diagnóstico, mantenimiento y reparación de vehículos. Si tienes alguna consulta sobre tu coche, cuéntamela y lo miramos.'

/** Respuesta fija para una consulta que describe un sintoma o urgencia de salud. Ver {@link OFF_TOPIC_RESPONSE}. */
export const HEALTH_REDIRECT_RESPONSE =
  'Eso es una consulta médica, no de vehículos, así que no puedo ayudarte con ella. Si tienes dolor, dificultad para respirar u otra urgencia de salud, acude a un médico o llama a emergencias (112) de inmediato.'

/**
 * Prefijos de la etiqueta que devuelve el clasificador, por orden de comprobacion,
 * mapeados al scope correspondiente. Tabla en vez de una cadena de `if`: separa el
 * dato (que prefijo cae en que scope) de la logica de recorrido, que es la que
 * cuenta para la complejidad ciclomatica.
 */
const LABEL_PREFIXES: ReadonlyArray<readonly [prefix: string, scope: DiagnosisScope]> = [
  ['FUERA_DE_AMBITO', DIAGNOSIS_SCOPE.FueraDeAmbito],
  ['FUERA', DIAGNOSIS_SCOPE.FueraDeAmbito],
  ['SALUD', DIAGNOSIS_SCOPE.Salud],
  ['VALORACION', DIAGNOSIS_SCOPE.Valoracion],
  ['ECU', DIAGNOSIS_SCOPE.IdentificacionEcu],
]

/** Traduce la etiqueta cruda del clasificador al scope; sin match, `vehiculo`. */
function scopeFromLabel(label: string): DiagnosisScope {
  const match = LABEL_PREFIXES.find(([prefix]) => label.startsWith(prefix))
  return match ? match[1] : DIAGNOSIS_SCOPE.Vehiculo
}

/**
 * Pide la etiqueta cruda al clasificador, o `null` si la llamada falla.
 *
 * Separado de {@link classifyDiagnosisScope} para que el try/catch de la llamada
 * a red no se sume a la complejidad de decidir el scope: son dos preocupaciones
 * distintas (obtener el dato, interpretarlo).
 */
async function fetchClassifierLabel(
  userQuery: string,
  llmClient: LlmClientPort,
): Promise<string | null> {
  try {
    const response = await llmClient.sendSingleMessage({
      systemPrompt: SCOPE_CLASSIFIER_SYSTEM_PROMPT,
      userMessage: userQuery,
      tools: [],
    })
    return response.text?.trim().toUpperCase() ?? ''
  } catch {
    return null
  }
}

/**
 * Decide si una consulta esta dentro del ambito de diagnostico de vehiculos, sin
 * tools disponibles: una llamada minima y rapida, mucho mas facil de cumplir de
 * forma consistente que pedirle lo mismo al prompt grande de diagnostico.
 *
 * Falla abierto hacia `'vehiculo'`: sin consulta, con una clasificacion ambigua, o
 * si la llamada al LLM falla, se deja pasar al flujo completo en vez de bloquear una
 * consulta legitima. Bloquear de mas es el error caro aqui, no dejar pasar de mas.
 */
export async function classifyDiagnosisScope(
  userQuery: string | undefined,
  llmClient: LlmClientPort,
): Promise<DiagnosisScope> {
  if (!userQuery?.trim()) return DIAGNOSIS_SCOPE.Vehiculo

  const label = await fetchClassifierLabel(userQuery, llmClient)
  return label === null ? DIAGNOSIS_SCOPE.Vehiculo : scopeFromLabel(label)
}
