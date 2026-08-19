import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'

/** Input del caso de uso de diagnostico cognitivo (solo datos). */
export interface ExecuteCognitiveDiagnosisInput {
  readonly userQuery?: string
  readonly vehicleContext?: VehicleInfo
  readonly conversationHistory?: readonly LlmConversationItem[]
}
