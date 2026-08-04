import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type {
  LlmClientPort,
} from '@/application/ports/LlmClientPort.js'
import type { LlmMessageInput } from '@/application/dto/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/LlmResponse.js'
import type { ToolCallTrace } from '@/application/dto/ToolCallTrace.js'
import { MaxToolCallIterationsError } from '@/application/llm/llmErrors.js'
import { mcpToolAdapter } from '@/infrastructure/llm/mcpToolAdapter.js'

// ── Constantes ──

/** Modelo Anthropic por defecto. */
const DEFAULT_MODEL = 'claude-sonnet-4-20250514'

/** Numero maximo de iteraciones de tool calling por defecto. */
const DEFAULT_MAX_ITERATIONS = 10

/** Timeout por defecto en milisegundos por llamada a la API. */
const DEFAULT_TIMEOUT_MS = 30_000

/** Maximo de tokens de salida para el LLM. */
const DEFAULT_MAX_TOKENS = 4096

// ── Tipos internos ──

/** Configuracion del cliente Anthropic. */
export interface AnthropicClientConfig {
  /** API key de Anthropic. */
  readonly apiKey: string
  /** Modelo a utilizar (default: claude-sonnet-4-20250514). */
  readonly model?: string
  /** Maximo de iteraciones de tool calling (default: 10). */
  readonly maxIterations?: number
  /** Timeout en ms por llamada a la API (default: 30_000). */
  readonly timeoutMs?: number
}

/** Error de timeout de la API de Anthropic. */
export class AnthropicTimeoutError extends Error {
  constructor(message: string = 'Anthropic API call timed out') {
    super(message)
    this.name = 'AnthropicTimeoutError'
  }
}

/** Error generico de la API de Anthropic. */
export class AnthropicApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'AnthropicApiError'
  }
}

// ── Helpers ──

import { isTimeoutError, hasStatusCode } from '@/infrastructure/llm/sdkErrorUtils.js'

/**
 * Envuelve un error del SDK de Anthropic en el tipo de error correspondiente
 * del adaptador.
 *
 * NUNCA pasa el `error.message` del SDK directamente. Usa mensajes genericos
 * para evitar fugas de informacion interna (OWASP A09).
 */
function wrapSdkError(error: unknown): never {
  if (isTimeoutError(error)) {
    console.error('[AnthropicClient] API call timed out', {
      name: error instanceof Error ? error.name : undefined,
    })
    throw new AnthropicTimeoutError('Anthropic API call timed out')
  }
  if (hasStatusCode(error)) {
    const status = error.status
    console.error('[AnthropicClient] API error', { status })
    if (status === 401) {
      throw new AnthropicApiError('Authentication failed', status)
    }
    if (status === 429) {
      throw new AnthropicApiError('Rate limit exceeded', status)
    }
    if (status >= 500) {
      throw new AnthropicApiError('Anthropic API server error', status)
    }
    throw new AnthropicApiError(`Anthropic API error (HTTP ${status})`, status)
  }
  const message = error instanceof Error ? error.message : String(error)
  console.error('[AnthropicClient] SDK error', { message })
  throw new AnthropicApiError('Anthropic API error')
}

/**
 * Extrae el texto de los bloques de contenido de tipo `text`.
 */
function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Extrae los bloques de tipo `tool_use` del contenido.
 */
function extractToolUseBlocks(
  content: Anthropic.Messages.ContentBlock[],
): Anthropic.Messages.ToolUseBlock[] {
  return content.filter(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
  )
}

/**
 * Serializa argumentos desconocidos a Record<string, unknown>.
 */
function serializeArgs(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) return {}
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>
  return {}
}

// ── Validacion de configuracion ──

/** Schema Zod para validar la configuracion del cliente Anthropic. */
const anthropicClientConfigSchema = z.object({
  /** API key de Anthropic (obligatoria, no vacia). */
  apiKey: z.string().min(1),
  /** Modelo a utilizar. */
  model: z.string().optional(),
  /** Maximo de iteraciones de tool calling (1-100). */
  maxIterations: z.number().int().positive().max(100).optional(),
  /** Timeout en ms por llamada a la API (1-120000). */
  timeoutMs: z.number().int().positive().max(120_000).optional(),
})

// ── Factory ──

/**
 * Crea un cliente LLM que se comunica con la API de Anthropic Claude.
 *
 * Implementa el puerto {@link LlmClientPort} con soporte para tool calling
 * ciclico (maximo {@link DEFAULT_MAX_ITERATIONS} iteraciones por defecto).
 *
 * @param config - Configuracion del cliente (apiKey requerida, resto opcional).
 * @returns Objeto conforme a {@link LlmClientPort}.
 */
export function createAnthropicClient(config: AnthropicClientConfig): LlmClientPort {
  const parsed = anthropicClientConfigSchema.parse(config)
  const model = parsed.model ?? DEFAULT_MODEL
  const maxIterations = parsed.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const timeoutMs = parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const client = new Anthropic({ apiKey: parsed.apiKey, timeout: timeoutMs })

  return {
    async sendMessage(input: LlmMessageInput): Promise<LlmResponse> {
      const { systemPrompt, userMessage, tools, handler } = input

      // Convierte herramientas MCP a formato Anthropic
      const anthropicTools: Anthropic.Messages.Tool[] = tools.map(mcpToolAdapter)

      // Construye el mapa de herramientas registradas para validacion
      const toolNames = new Set(tools.map((t) => t.name))

      // Historial de mensajes
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: userMessage }]

      // Traza acumulada de tool calls
      const toolTrace: ToolCallTrace[] = []

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        let response: Anthropic.Messages.Message
        try {
          response = await client.messages.create({
            model,
            max_tokens: DEFAULT_MAX_TOKENS,
            system: systemPrompt,
            messages,
            tools: anthropicTools,
          })
        } catch (error: unknown) {
          wrapSdkError(error)
        }

        const stopReason = response.stop_reason

        // Caso: texto final (end_turn u otras razones sin tool_use)
        if (stopReason !== 'tool_use') {
          return {
            text: extractText(response.content),
            toolCalls: toolTrace,
          }
        }

        // Caso: tool_use — extraer tool blocks y ejecutar handlers
        const toolBlocks = extractToolUseBlocks(response.content)
        const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

        for (const block of toolBlocks) {
          const args = serializeArgs(block.input)
          let result: string

          // Verificar si la herramienta esta registrada
          if (!toolNames.has(block.name)) {
            result = `Unknown tool: ${block.name}`
          } else {
            try {
              result = await handler(block.name, args)
            } catch (error: unknown) {
              console.error(
                `[AnthropicClient] Tool handler error for '${block.name}':`,
                error instanceof Error ? error.message : String(error),
              )
              result = `Tool execution failed: ${block.name}`
            }
          }

          toolTrace.push({ tool: block.name, args, result })

          const isError =
            result.startsWith('Unknown tool:') || result.startsWith('Tool execution failed:')
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
            is_error: isError,
          })
        }

        // Agrega el mensaje del asistente con los tool_use blocks
        messages.push({ role: 'assistant', content: response.content })
        // Agrega el mensaje del usuario con los tool_result blocks
        messages.push({ role: 'user', content: toolResults })
      }

      // Se alcanzo el limite de iteraciones
      throw new MaxToolCallIterationsError(
        `Exceeded maximum tool call iterations (${maxIterations}).`,
        toolTrace,
      )
    },
  }
}
