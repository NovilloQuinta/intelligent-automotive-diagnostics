import { z } from 'zod'
import OpenAI from 'openai'
import type {
  LlmClientPort,
  LlmMessageInput,
  LlmResponse,
  ToolCallTrace,
} from '@/application/ports/llmClient.port.js'
import { MaxToolCallIterationsError } from '@/application/ports/llmClient.port.js'
import { openAiToolAdapter } from '@/infrastructure/llm/openAiToolAdapter.js'

// ── Constantes ──

/** Numero maximo de iteraciones de tool calling por defecto. */
const DEFAULT_MAX_ITERATIONS = 10

/** Timeout por defecto en milisegundos por llamada a la API. */
const DEFAULT_TIMEOUT_MS = 30_000

// ── Tipos internos ──

/** Configuracion del cliente OpenAI-compatible. */
export interface OpenAiClientConfig {
  /** API key del proveedor (obligatoria). */
  readonly apiKey: string
  /** URL base del endpoint (obligatoria — ej. https://api.deepseek.com). */
  readonly baseURL: string
  /** Modelo a utilizar (obligatorio — ej. deepseek-chat, gpt-4o). */
  readonly model: string
  /** Maximo de iteraciones de tool calling (default: 10). */
  readonly maxIterations?: number
  /** Timeout en ms por llamada a la API (default: 30_000). */
  readonly timeoutMs?: number
}

/** Error de timeout de la API de OpenAI. */
export class OpenAiTimeoutError extends Error {
  constructor(message: string = 'OpenAI API call timed out') {
    super(message)
    this.name = 'OpenAiTimeoutError'
  }
}

/** Error generico de la API de OpenAI. */
export class OpenAiApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'OpenAiApiError'
  }
}

// ── Helpers ──

import { isTimeoutError, hasStatusCode } from '@/infrastructure/llm/sdkErrorUtils.js'

/**
 * Envuelve un error del SDK de OpenAI en el tipo de error correspondiente
 * del adaptador.
 *
 * NUNCA pasa el `error.message` del SDK directamente. Usa mensajes genericos
 * para evitar fugas de informacion interna (OWASP A09).
 */
function wrapSdkError(error: unknown): never {
  if (isTimeoutError(error)) {
    console.error('[OpenAiClient] API call timed out', {
      name: error instanceof Error ? error.name : undefined,
    })
    throw new OpenAiTimeoutError('OpenAI API call timed out')
  }
  if (hasStatusCode(error)) {
    const status = error.status
    console.error('[OpenAiClient] API error', { status })
    if (status === 401) {
      throw new OpenAiApiError('Authentication failed', status)
    }
    if (status === 429) {
      throw new OpenAiApiError('Rate limit exceeded', status)
    }
    if (status >= 500) {
      throw new OpenAiApiError('OpenAI API server error', status)
    }
    throw new OpenAiApiError(`OpenAI API error (HTTP ${status})`, status)
  }
  console.error('[OpenAiClient] SDK error', {
    errorType: error instanceof Error ? error.name : 'unknown',
  })
  throw new OpenAiApiError('OpenAI API error')
}

// ── Validacion de configuracion ──

/** Schema Zod para validar la configuracion del cliente OpenAI. */
const openAiClientConfigSchema = z.object({
  /** API key del proveedor (obligatoria, no vacia). */
  apiKey: z.string().min(1),
  /** URL base del endpoint (obligatoria). */
  baseURL: z.string().url(),
  /** Modelo a utilizar (obligatorio). */
  model: z.string().min(1),
  /** Maximo de iteraciones de tool calling (1-100). */
  maxIterations: z.number().int().positive().max(100).optional(),
  /** Timeout en ms por llamada a la API (1-120000). */
  timeoutMs: z.number().int().positive().max(120_000).optional(),
})

// ── Factory ──

/**
 * Crea un cliente LLM que se comunica con cualquier API compatible con OpenAI.
 *
 * Implementa el puerto {@link LlmClientPort} con soporte para tool calling
 * ciclico (maximo {@link DEFAULT_MAX_ITERATIONS} iteraciones por defecto).
 *
 * Es provider-agnostic: el proveedor se configura via `baseURL` y `model`
 * (obligatorios). Funciona con OpenAI, DeepSeek, Groq, Mistral, xAI
 * y cualquier otro proveedor que exponga un endpoint compatible con la API de OpenAI.
 *
 * @param config - Configuracion del cliente (apiKey, baseURL y model obligatorios).
 * @returns Objeto conforme a {@link LlmClientPort}.
 *
 * @throws {ZodError} Si la configuracion no cumple el schema.
 * @throws {OpenAiTimeoutError} Si una llamada a la API excede el timeout.
 * @throws {OpenAiApiError} Si la API responde con un error HTTP.
 */
export function createOpenAiClient(config: OpenAiClientConfig): LlmClientPort {
  const parsed = openAiClientConfigSchema.parse(config)
  const baseURL = parsed.baseURL
  const model = parsed.model
  const maxIterations = parsed.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const timeoutMs = parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const client = new OpenAI({
    apiKey: parsed.apiKey,
    baseURL,
    timeout: timeoutMs,
  })

  return {
    async sendMessage(input: LlmMessageInput): Promise<LlmResponse> {
      const { systemPrompt, userMessage, tools, handler } = input

      // Convierte herramientas MCP a formato OpenAI
      const openAiTools = tools.map(openAiToolAdapter)

      // Construye el mapa de herramientas registradas para validacion
      const toolNames = new Set(tools.map((t) => t.name))

      // Historial de mensajes en formato OpenAI
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ]

      // Traza acumulada de tool calls
      const toolTrace: ToolCallTrace[] = []

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        let response: OpenAI.Chat.Completions.ChatCompletion
        try {
          response = await client.chat.completions.create(
            {
              model,
              messages,
              tools: openAiTools,
              stream: false,
            },
            {
              // Pasar timeout en opciones de request
              timeout: timeoutMs,
            },
          )
        } catch (error: unknown) {
          wrapSdkError(error)
        }

        const choice = response.choices[0]
        if (!choice) {
          throw new OpenAiApiError('No response choices from OpenAI API')
        }

        const finishReason = choice.finish_reason
        const message = choice.message

        // Caso: texto final (stop, length, u otros sin tool_calls)
        if (
          finishReason === 'stop' ||
          finishReason === 'length' ||
          !message.tool_calls ||
          message.tool_calls.length === 0
        ) {
          return {
            text: message.content ?? '',
            toolCalls: toolTrace,
          }
        }

        // Caso: tool_calls — procesar cada tool call
        const toolCalls = message.tool_calls
        const toolMessages: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] = []

        for (const tc of toolCalls) {
          if (tc.type !== 'function') {
            // Solo soportamos function calls; ignorar custom tools
            continue
          }

          let args: Record<string, unknown>
          try {
            args = JSON.parse(tc.function.arguments) as Record<string, unknown>
          } catch {
            console.warn(
              '[OpenAiClient] Failed to parse tool call arguments',
              tc.function.arguments,
            )
            args = {}
          }

          let result: string

          // Verificar si la herramienta esta registrada
          if (!toolNames.has(tc.function.name)) {
            result = `Unknown tool: ${tc.function.name}`
          } else {
            try {
              result = await handler(tc.function.name, args)
            } catch (error: unknown) {
              console.error(
                `[OpenAiClient] Tool handler error for '${tc.function.name}':`,
                error instanceof Error ? error.message : String(error),
              )
              result = `Tool execution failed: ${tc.function.name}`
            }
          }

          toolTrace.push({ tool: tc.function.name, args, result })

          toolMessages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: result,
          })
        }

        // Agrega el mensaje del asistente con los tool_calls
        messages.push({
          role: 'assistant',
          content: message.content,
          tool_calls: message.tool_calls as OpenAI.Chat.Completions.ChatCompletionMessageToolCall[],
        })

        // Agrega los mensajes de resultado de tools
        for (const tm of toolMessages) {
          messages.push(tm)
        }
      }

      // Se alcanzo el limite de iteraciones
      throw new MaxToolCallIterationsError(
        `Exceeded maximum tool call iterations (${maxIterations}).`,
        toolTrace,
      )
    },
  }
}
