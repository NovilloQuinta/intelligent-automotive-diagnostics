import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import { createSerpApiClient } from '@/infrastructure/web-search/serpApiClient.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/**
 * Composicion de los servicios externos que consume el agente: el modelo y la
 * busqueda web.
 *
 * Los dos son opcionales y se resuelven por configuracion. Sin clave de LLM no hay
 * diagnostico cognitivo; sin clave de busqueda, el agente se queda con lo que ya
 * sabe el catalogo.
 */

/** Falla con un mensaje de configuracion, no con un ZodError de "string too small". */
function requireConfig(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Missing required configuration: ${name}`)
  return value
}

/** Crea el cliente LLM segun el proveedor configurado, o undefined si no hay provider. */
export function createLlmClient(config: AppConfig, logger: LoggerPort): LlmClientPort | undefined {
  if (config.LLM_PROVIDER === 'anthropic') {
    return createAnthropicClient({
      apiKey: requireConfig(config.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
      model: config.LLM_MODEL,
      temperature: config.LLM_TEMPERATURE,
      logger,
    })
  }
  if (config.LLM_PROVIDER === 'openai') {
    return createOpenAiClient({
      apiKey: requireConfig(config.LLM_API_KEY, 'LLM_API_KEY'),
      baseURL: requireConfig(config.LLM_BASE_URL, 'LLM_BASE_URL'),
      model: requireConfig(config.LLM_MODEL, 'LLM_MODEL'),
      temperature: config.LLM_TEMPERATURE,
      logger,
    })
  }
  return undefined
}

/** Crea el puerto de búsqueda web si la API key está configurada. */
export function createWebSearchPort(config: AppConfig): WebSearchPort | undefined {
  if (!config.WEB_SEARCH_API_KEY) return undefined
  return createSerpApiClient({ apiKey: config.WEB_SEARCH_API_KEY })
}
