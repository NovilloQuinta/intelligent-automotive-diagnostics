import { z } from 'zod'
import OpenAI from 'openai'
import type { McpToolDefinition } from '@/application/dto/McpToolDefinition.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import type { LlmConversationItem } from '@/application/dto/LlmMessageInput.js'
import { mcpToolDefinitionSchema } from '@/infrastructure/llm/toolDefinitionSchema.js'
import { LlmApiError } from '@/infrastructure/llm/llmErrors.js'
import { composeLlmClient } from '@/infrastructure/llm/composeLlmClient.js'
import { createLlmAdapter, buildMessages } from '@/infrastructure/llm/createLlmAdapter.js'

const DEFAULT_TIMEOUT_MS = 30_000

/** Configuracion del cliente OpenAI-compatible. */
export interface OpenAiClientConfig {
  readonly apiKey: string
  readonly baseURL: string
  readonly model: string
  readonly maxIterations?: number
  readonly timeoutMs?: number
}

const openAiClientConfigSchema = z.object({
  apiKey: z.string().min(1),
  baseURL: z.string().url(),
  model: z.string().min(1),
  maxIterations: z.number().int().positive().max(100).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
})

type OpenAiParsedConfig = z.infer<typeof openAiClientConfigSchema>

function toOpenAiTool(tool: McpToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
  const parsed = mcpToolDefinitionSchema.parse(tool)
  return {
    type: 'function' as const,
    function: {
      name: parsed.name,
      description: parsed.description,
      parameters: (parsed.schema ?? { type: 'object', properties: {} }) as Record<string, unknown>,
    },
  }
}

function buildOpenAiMessages(
  conversationHistory: readonly LlmConversationItem[] | undefined,
  userMessage: string,
  systemPrompt: string,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  return buildMessages<OpenAI.Chat.Completions.ChatCompletionMessageParam>(
    {
      buildInitial: (um, sp) => [
        { role: 'system', content: sp },
        { role: 'user', content: um },
      ],
      buildUserMessage: (content) => ({ role: 'user', content }),
      buildRawResponse: (data) => {
        const raw = data as OpenAI.Chat.Completions.ChatCompletion
        const msg = raw.choices[0]?.message
        return {
          role: 'assistant',
          content: msg?.content ?? null,
          tool_calls: msg?.tool_calls as
            OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
        }
      },
      buildToolResult: (callId, content) => ({
        role: 'tool',
        tool_call_id: callId,
        content,
      }),
    },
    conversationHistory,
    userMessage,
    systemPrompt,
  )
}

function parseOpenAiResponse(response: OpenAI.Chat.Completions.ChatCompletion): LlmSingleResponse {
  const choice = response.choices[0]
  if (!choice) throw new LlmApiError('No response choices from OpenAI API')

  const { finish_reason: finishReason, message } = choice
  if (
    finishReason === 'stop' ||
    finishReason === 'length' ||
    !message.tool_calls ||
    message.tool_calls.length === 0
  ) {
    return { text: message.content ?? '', toolCalls: [], raw: response }
  }

  const toolCalls = message.tool_calls
    .filter(
      (
        tc,
      ): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & {
        function: { name: string; arguments: string }
      } => tc.type === 'function',
    )
    .map((tc) => {
      let args: Record<string, unknown>
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>
      } catch {
        args = {}
      }
      return { name: tc.function.name, args, id: tc.id }
    })

  return { text: null, toolCalls, raw: response }
}

const createThinAdapter = createLlmAdapter<
  OpenAiParsedConfig,
  OpenAI,
  OpenAI.Chat.Completions.ChatCompletion
>({
  configSchema: openAiClientConfigSchema,
  createSdkClient: (parsedConfig) =>
    new OpenAI({
      apiKey: parsedConfig.apiKey,
      baseURL: parsedConfig.baseURL,
      timeout: parsedConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }),
  callSdkApi: async (client, messages, tools, _systemPrompt, parsedConfig) => {
    return client.chat.completions.create(
      {
        model: parsedConfig.model,
        messages,
        tools: tools.map(toOpenAiTool),
        stream: false,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
      { timeout: parsedConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS },
    )
  },
  buildMessages: buildOpenAiMessages,
  parseResponse: parseOpenAiResponse,
  providerLabel: 'OpenAI',
})

/** Crea un cliente LLM provider-agnostic via API compatible con OpenAI. */
export function createOpenAiClient(config: OpenAiClientConfig): LlmClientPort {
  const parsed = openAiClientConfigSchema.parse(config)
  return composeLlmClient(createThinAdapter(config).sendSingleMessage, parsed.maxIterations)
}
