import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'

export interface ExecuteCognitiveDiagnosisInput {
  readonly userQuery?: string
  readonly vehicleContext?: VehicleInfo
  readonly conversationHistory?: readonly LlmConversationItem[]
}
