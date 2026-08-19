import { z } from 'zod'

/**
 * Un turno del historial de conversacion que llega del cliente.
 *
 * Union discriminada por `__type`: el mensaje del usuario, la respuesta cruda del
 * modelo y el resultado de una tool tienen formas distintas y no deben mezclarse.
 */
export const LlmConversationItemSchema = z.discriminatedUnion('__type', [
  z.object({ __type: z.literal('user_message'), content: z.string() }),
  z.object({ __type: z.literal('raw_response'), data: z.unknown() }),
  z.object({
    __type: z.literal('tool_result'),
    toolCallId: z.string(),
    content: z.string(),
    isError: z.boolean(),
  }),
])
