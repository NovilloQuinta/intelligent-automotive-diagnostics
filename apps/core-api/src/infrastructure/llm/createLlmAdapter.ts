import type { z } from 'zod'
import type { LlmMessageInput, LlmConversationItem } from '@/application/dto/LlmMessageInput.js'
import type { LlmSingleResponse } from '@/application/dto/LlmSingleResponse.js'
import type { McpToolDefinition } from '@/application/dto/McpToolDefinition.js'
import type { LlmSingleMessageSender } from '@/application/use-cases/ExecuteLlmToolCalling.js'
import { wrapSdkError } from '@/infrastructure/llm/sdkErrorUtils.js'

/** Constructores de mensajes nativos para cada tipo de item del historial. */
interface MessageBuilders<TMessage> {
  readonly buildInitial: (userMessage: string, systemPrompt: string) => TMessage[]
  readonly buildUserMessage: (content: string) => TMessage
  readonly buildRawResponse: (data: unknown) => TMessage
  readonly buildToolResult: (callId: string, content: string, isError: boolean) => TMessage
}

/** Construye mensajes en formato nativo del provider a partir del historial de conversacion. */
export function buildMessages<TMessage>(
  builders: MessageBuilders<TMessage>,
  conversationHistory: readonly LlmConversationItem[] | undefined,
  userMessage: string,
  systemPrompt: string,
): TMessage[] {
  if (!conversationHistory || conversationHistory.length === 0) {
    return builders.buildInitial(userMessage, systemPrompt)
  }
  return conversationHistory.map((item) => {
    if (item.__type === 'user_message') return builders.buildUserMessage(item.content)
    if (item.__type === 'raw_response') return builders.buildRawResponse(item.data)
    return builders.buildToolResult(item.toolCallId, item.content, item.isError)
  })
}

/** Parametros para la factory generica de thin adapters LLM. */
export interface CreateLlmAdapterParams<TConfig, TClient, TRawResponse> {
  readonly configSchema: z.ZodSchema<TConfig>
  readonly createSdkClient: (parsedConfig: TConfig) => TClient
  readonly callSdkApi: (
    client: TClient,
    messages: unknown[],
    tools: readonly McpToolDefinition[],
    systemPrompt: string,
    parsedConfig: TConfig,
  ) => Promise<TRawResponse>
  readonly buildMessages: (
    conversationHistory: LlmMessageInput['conversationHistory'],
    userMessage: string,
    systemPrompt: string,
  ) => unknown[]
  readonly parseResponse: (rawResponse: TRawResponse) => LlmSingleResponse
  readonly providerLabel: string
}

/** Crea una factory de thin adapters LLM generica. */
export function createLlmAdapter<TConfig, TClient, TRawResponse>(
  params: CreateLlmAdapterParams<TConfig, TClient, TRawResponse>,
): (rawConfig: unknown) => { sendSingleMessage: LlmSingleMessageSender } {
  const { configSchema, createSdkClient, callSdkApi, buildMessages, parseResponse, providerLabel } =
    params

  return (rawConfig: unknown) => {
    const parsedConfig = configSchema.parse(rawConfig)
    const client = createSdkClient(parsedConfig)

    const sendSingleMessage: LlmSingleMessageSender = async (input) => {
      const messages = buildMessages(
        input.conversationHistory,
        input.userMessage,
        input.systemPrompt,
      )

      let response: TRawResponse
      try {
        response = await callSdkApi(client, messages, input.tools, input.systemPrompt, parsedConfig)
      } catch (error: unknown) {
        wrapSdkError(providerLabel, error)
      }

      return parseResponse(response)
    }

    return { sendSingleMessage }
  }
}
