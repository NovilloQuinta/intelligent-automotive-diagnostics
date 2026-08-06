import { z } from 'zod'
import Anthropic from '@anthropic-ai/sdk'
import type { McpToolDefinition } from '@/application/dto/McpToolDefinition.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import type { LlmConversationItem } from '@/application/dto/LlmMessageInput.js'
import { mcpToolDefinitionSchema } from '@/infrastructure/llm/toolDefinitionSchema.js'
import { composeLlmClient } from '@/infrastructure/llm/composeLlmClient.js'
import { createLlmAdapter, buildMessages } from '@/infrastructure/llm/createLlmAdapter.js'

const DEFAULT_MODEL = 'claude-sonnet-4-20250514'
const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_TOKENS = 4096

/** Configuracion del cliente Anthropic. */
export interface AnthropicClientConfig {
  readonly apiKey: string
  readonly model?: string
  readonly maxIterations?: number
  readonly timeoutMs?: number
  readonly logger?: LoggerPort
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

type AnthropicParsedConfig = z.infer<typeof anthropicClientConfigSchema>

function buildAnthropicMessages(
  conversationHistory: readonly LlmConversationItem[] | undefined,
  userMessage: string,
  _systemPrompt: string,
): Anthropic.Messages.MessageParam[] {
  return buildMessages<Anthropic.Messages.MessageParam>(
    {
      buildInitial: (um) => [{ role: 'user', content: um }],
      buildUserMessage: (content) => ({ role: 'user', content }),
      buildRawResponse: (data) => {
        const raw = data as Anthropic.Messages.Message
        return { role: 'assistant', content: raw.content }
      },
      buildToolResult: (callId, content, isError) => ({
        role: 'user',
        content: [
          { type: 'tool_result' as const, tool_use_id: callId, content, is_error: isError },
        ],
      }),
    },
    conversationHistory,
    userMessage,
    _systemPrompt,
  )
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

const createThinAdapter = createLlmAdapter<
  AnthropicParsedConfig,
  Anthropic,
  Anthropic.Messages.Message
>({
  configSchema: anthropicClientConfigSchema,
  createSdkClient: (parsedConfig) =>
    new Anthropic({
      apiKey: parsedConfig.apiKey,
      timeout: parsedConfig.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }),
  callSdkApi: async (client, messages, tools, systemPrompt, parsedConfig) => {
    return client.messages.create({
      model: parsedConfig.model ?? DEFAULT_MODEL,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: systemPrompt,
      messages: messages as Anthropic.Messages.MessageParam[],
      tools: tools.map(toAnthropicTool),
    })
  },
  buildMessages: buildAnthropicMessages,
  parseResponse: parseAnthropicResponse,
  providerLabel: 'Anthropic',
})

/** Crea un cliente LLM que se comunica con la API de Anthropic Claude. */
export function createAnthropicClient(config: AnthropicClientConfig): LlmClientPort {
  const parsed = anthropicClientConfigSchema.parse(config)
  return composeLlmClient(
    createThinAdapter(config).sendSingleMessage,
    parsed.maxIterations,
    config.logger ?? console,
  )
}
