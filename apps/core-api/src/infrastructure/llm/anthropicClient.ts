import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { McpToolDefinition } from '@/application/dto/McpToolDefinition.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmMessageInput } from '@/application/dto/LlmMessageInput.js'
import type { LlmResponse } from '@/application/dto/LlmResponse.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import { mcpToolDefinitionSchema } from '@/infrastructure/llm/toolDefinitionSchema.js'
import { wrapSdkError } from '@/infrastructure/llm/sdkErrorUtils.js'
import { ExecuteLlmToolCalling } from '@/application/use-cases/ExecuteLlmToolCalling.js'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_MAX_ITERATIONS = 10
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 4096

/** Configuracion del cliente Anthropic. */
export interface AnthropicClientConfig {
  readonly apiKey: string
  readonly model?: string
  readonly maxIterations?: number
  readonly timeoutMs?: number
}

function extractText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

function extractToolUseBlocks(
  content: Anthropic.Messages.ContentBlock[],
): Anthropic.Messages.ToolUseBlock[] {
  return content.filter(
    (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
  )
}

function serializeArgs(input: unknown): Record<string, unknown> {
  if (input === null || input === undefined) return {}
  if (typeof input === 'object' && !Array.isArray(input)) return input as Record<string, unknown>
  return {}
}

const DEFAULT_TOOL_SCHEMA: Record<string, unknown> = { type: 'object', properties: {} }

function toAnthropicTool(tool: McpToolDefinition): Anthropic.Messages.Tool {
  const parsed = mcpToolDefinitionSchema.parse(tool)
  return {
    name: parsed.name,
    description: parsed.description,
    input_schema: (parsed.schema ?? DEFAULT_TOOL_SCHEMA) as Anthropic.Messages.Tool.InputSchema,
  }
}

const anthropicClientConfigSchema = z.object({
  apiKey: z.string().min(1),
  model: z.string().optional(),
  maxIterations: z.number().int().positive().max(100).optional(),
  timeoutMs: z.number().int().positive().max(120_000).optional(),
})

function buildAnthropicMessages(input: LlmMessageInput): Anthropic.Messages.MessageParam[] {
  const { userMessage, conversationHistory } = input
  if (!conversationHistory || conversationHistory.length === 0) {
    return [{ role: 'user', content: userMessage }]
  }
  return conversationHistory.map((item): Anthropic.Messages.MessageParam => {
    if (item.__type === 'user_message') return { role: 'user', content: item.content }
    if (item.__type === 'raw_response') {
      const raw = item.data as Anthropic.Messages.Message
      return { role: 'assistant', content: raw.content }
    }
    return {
      role: 'user',
      content: [
        {
          type: 'tool_result' as const,
          tool_use_id: item.toolCallId,
          content: item.content,
          is_error: item.isError,
        },
      ],
    }
  })
}

function parseAnthropicResponse(response: Anthropic.Messages.Message): LlmSingleResponse {
  if (response.stop_reason !== 'tool_use') {
    return { text: extractText(response.content), toolCalls: [], raw: response }
  }
  return {
    text: null,
    toolCalls: extractToolUseBlocks(response.content).map((b) => ({
      name: b.name,
      args: serializeArgs(b.input),
      id: b.id,
    })),
    raw: response,
  }
}

function createThinAdapter(config: AnthropicClientConfig) {
  const parsed = anthropicClientConfigSchema.parse(config)
  const model = parsed.model ?? DEFAULT_MODEL
  const client = new Anthropic({
    apiKey: parsed.apiKey,
    timeout: parsed.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  })

  async function sendSingleMessage(input: LlmMessageInput): Promise<LlmSingleResponse> {
    const messages = buildAnthropicMessages(input)
    let response: Anthropic.Messages.Message
    try {
      response = await client.messages.create({
        model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: input.systemPrompt,
        messages,
        tools: input.tools.map(toAnthropicTool),
      })
    } catch (error: unknown) {
      wrapSdkError('Anthropic', error)
    }
    return parseAnthropicResponse(response)
  }

  return { sendSingleMessage }
}

/** Crea un cliente LLM que se comunica con la API de Anthropic Claude. */
export function createAnthropicClient(config: AnthropicClientConfig): LlmClientPort {
  const parsed = anthropicClientConfigSchema.parse(config)
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
