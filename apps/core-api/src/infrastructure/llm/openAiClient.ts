import { z } from 'zod'
import OpenAI from 'openai'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmMessageInput } from '@/application/dto/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import { openAiToolAdapter } from '@/infrastructure/llm/openAiToolAdapter.js'
import { wrapSdkError } from '@/infrastructure/llm/sdkErrorUtils.js'
import { LlmApiError } from '@/infrastructure/llm/llmErrors.js'
import { ExecuteLlmToolCalling } from '@/application/use-cases/ExecuteLlmToolCalling.js'

const DEFAULT_MAX_ITERATIONS = 10
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

function buildOpenAiMessages(
  input: LlmMessageInput,
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const { systemPrompt, userMessage, conversationHistory } = input
  if (!conversationHistory || conversationHistory.length === 0) {
    return [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]
  }
  return conversationHistory.map((item): OpenAI.Chat.Completions.ChatCompletionMessageParam => {
    if (item.__type === 'user_message') return { role: 'user', content: item.content }
    if (item.__type === 'raw_response') {
      const raw = item.data as OpenAI.Chat.Completions.ChatCompletion
      const msg = raw.choices[0]?.message
      return {
        role: 'assistant',
        content: msg?.content ?? null,
        tool_calls: msg?.tool_calls as
          OpenAI.Chat.Completions.ChatCompletionMessageToolCall[] | undefined,
      }
    }
    return { role: 'tool', tool_call_id: item.toolCallId, content: item.content }
  })
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

function createThinAdapter(config: OpenAiClientConfig) {
  const parsed = openAiClientConfigSchema.parse(config)
  const timeoutMs = parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const client = new OpenAI({
    apiKey: parsed.apiKey,
    baseURL: parsed.baseURL,
    timeout: timeoutMs,
  })

  async function sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse> {
    const messages = buildOpenAiMessages(input)
    let response: OpenAI.Chat.Completions.ChatCompletion
    try {
      response = await client.chat.completions.create(
        { model: parsed.model, messages, tools: input.tools.map(openAiToolAdapter), stream: false },
        { timeout: timeoutMs },
      )
    } catch (error: unknown) {
      wrapSdkError('OpenAI', error)
    }
    return parseOpenAiResponse(response)
  }

  return { sendSingleMessage }
}

/** Crea un cliente LLM provider-agnostic via API compatible con OpenAI. */
export function createOpenAiClient(config: OpenAiClientConfig): LlmClientPort {
  const parsed = openAiClientConfigSchema.parse(config)
  const maxIterations = parsed.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const thinAdapter = createThinAdapter(config)
  const toolCallingUseCase = new ExecuteLlmToolCalling(thinAdapter.sendSingleMessage, maxIterations)

  return {
    sendMessage(input: LlmMessageInput): Promise<LlmResponse> {
      return toolCallingUseCase.execute(input)
    },
    sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse> {
      return thinAdapter.sendSingleMessage(input)
    },
  }
}
