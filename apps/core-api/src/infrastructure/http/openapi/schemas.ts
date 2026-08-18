import type { SchemaMap } from './registry.js'

import { registerUserSchema } from '@/application/dto/auth/RegisterUserInput.js'
import { loginUserSchema } from '@/application/dto/auth/LoginUserInput.js'
import { refreshTokenSchema } from '@/application/dto/auth/RefreshTokenInput.js'
import { forgotPasswordSchema } from '@/application/dto/auth/ForgotPasswordInput.js'
import { resetPasswordSchema } from '@/application/dto/auth/ResetPasswordInput.js'
import { updateProfileSchema } from '@/application/dto/profile/UpdateProfileInput.js'
import { changePasswordSchema } from '@/application/dto/profile/ChangePasswordInput.js'
import { knowledgeSearchInputSchema } from '@/application/dto/admin/KnowledgeSearchInput.js'
import {
  DiagnosisBodySchema,
  McpToolBodySchema,
  CognitiveDiagnosisBodySchema,
  VehicleIdentityBodySchema,
} from '@/infrastructure/http/controllers/DiagnosisController.js'

import * as auth from './contracts/auth.js'
import * as diagnosis from './contracts/diagnosis.js'
import * as admin from './contracts/admin.js'
import * as mcp from './contracts/mcp.js'

/**
 * Mapa de todo lo que acaba en `components.schemas`.
 *
 * Las **peticiones** son exactamente los mismos schemas Zod con los que la aplicacion
 * valida en runtime: importarlos aqui es lo que impide que la documentacion y la
 * validacion se contradigan. Las **respuestas** viven en `contracts/` y describen lo
 * que los controladores proyectan.
 */
export const openApiSchemas: SchemaMap = {
  // ---- Peticiones (los mismos que validan) ----
  RegisterRequest: registerUserSchema,
  LoginRequest: loginUserSchema,
  RefreshRequest: refreshTokenSchema,
  ForgotPasswordRequest: forgotPasswordSchema,
  ResetPasswordRequest: resetPasswordSchema,
  UpdateProfileRequest: updateProfileSchema,
  ChangePasswordRequest: changePasswordSchema,
  KnowledgeSearchRequest: knowledgeSearchInputSchema,
  DiagnosisRequest: DiagnosisBodySchema,
  McpToolRequest: McpToolBodySchema,
  CognitiveDiagnosisRequest: CognitiveDiagnosisBodySchema,
  VehicleIdentityRequest: VehicleIdentityBodySchema,

  // ---- Respuestas: auth y perfil ----
  UserProfile: auth.userProfileSchema,
  TokenPair: auth.tokenPairSchema,
  AuthResponse: auth.authResponseSchema,
  UpdatedProfile: auth.updatedProfileSchema,
  SuccessAck: auth.successAckSchema,
  MessageAck: auth.messageAckSchema,

  // ---- Respuestas: diagnostico ----
  Scenario: diagnosis.scenarioSchema,
  LiveData: diagnosis.liveDataSchema,
  AvailablePid: diagnosis.availablePidSchema,
  DtcCode: diagnosis.dtcCodeSchema,
  VehicleInfo: diagnosis.vehicleInfoSchema,
  DiagnosisResult: diagnosis.diagnosisResultSchema,
  FreezeFrame: diagnosis.freezeFrameSchema,
  EcuInfo: diagnosis.ecuInfoSchema,
  DiagnosisSessionSummary: diagnosis.diagnosisSessionSummarySchema,
  DiagnosisSessionDetail: diagnosis.diagnosisSessionDetailSchema,
  DiagnosisSessionList: diagnosis.diagnosisSessionListSchema,
  VehicleProfile: diagnosis.vehicleProfileSchema,
  ConfirmVehicleIdentity: diagnosis.confirmVehicleIdentitySchema,
  ScenarioList: diagnosis.scenarioListSchema,
  AvailablePidsResponse: diagnosis.availablePidsResponseSchema,
  EcuInfoResponse: diagnosis.ecuInfoResponseSchema,
  DtcCodesResponse: diagnosis.dtcCodesResponseSchema,
  FreezeFrameResponse: diagnosis.freezeFrameResponseSchema,
  ClearDtcResponse: diagnosis.clearDtcResponseSchema,
  LiveDataResponse: diagnosis.liveDataResponseSchema,
  VehicleInfoResponse: diagnosis.vehicleInfoResponseSchema,
  VehicleStatus: diagnosis.vehicleStatusSchema,

  // ---- Respuestas: MCP ----
  McpCapabilities: mcp.mcpCapabilitiesSchema,
  McpToolResult: mcp.mcpToolResultSchema,
  ToolCallTrace: mcp.toolCallTraceSchema,
  PidObservation: mcp.pidObservationSchema,
  CognitiveDiagnosisResult: mcp.cognitiveDiagnosisResultSchema,

  // ---- Respuestas: admin ----
  AdminUserStats: admin.adminUserStatsSchema,
  AdminOverview: admin.adminOverviewSchema,
  AdminLogEntry: admin.adminLogEntrySchema,
  AdminLogsPage: admin.adminLogsPageSchema,
  AdminAuditLogEntry: admin.adminAuditLogEntrySchema,
  AdminAuditLogsPage: admin.adminAuditLogsPageSchema,
  AdminUserEntry: admin.adminUserEntrySchema,
  AdminUsersPage: admin.adminUsersPageSchema,
  KnowledgeIndexSummary: admin.knowledgeIndexSummarySchema,
  KnowledgeStats: admin.knowledgeStatsSchema,
  KnowledgeSearchResponse: admin.knowledgeSearchResponseSchema,
}
