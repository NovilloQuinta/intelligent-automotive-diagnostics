import type { LlmMessageInput } from '@/application/dto/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/LlmResponse.js'

/**
 * Puerto para cliente LLM.
 *
 * Abstrae la comunicacion con un modelo de lenguaje (Anthropic Claude, OpenAI, etc.)
 * para diagnostico cognitivo vehicular con tool calling.
 */
export interface LlmClientPort {
  /**
   * Envia un prompt al LLM y gestiona el ciclo de tool calling.
   *
   * @param input - Prompt del sistema, mensaje de usuario, herramientas disponibles y manejador.
   * @returns Respuesta estructurada con el texto de diagnostico y la traza de herramientas.
   * @throws {MaxToolCallIterationsError} Si el LLM excede el limite maximo de iteraciones sin generar texto final.
   */
  sendMessage(input: LlmMessageInput): Promise<LlmResponse>
}
