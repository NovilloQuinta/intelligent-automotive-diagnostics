import { Router } from 'express'
import type { SimulationScenario } from '@/infrastructure/obd/simulationScenario.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(deps: {
  readonly scenarios: SimulationScenario[]
  readonly obdRepo?: ObdRepository
  readonly llmClient?: LlmClientPort
  readonly cognitiveTimeoutMs?: number
}): Router {
  const router = Router()
  const controller = new DiagnosisController(deps)

  router.get('/scenarios', controller.listScenarios)
  router.post('/diagnosis', controller.diagnose)
  router.post('/mcp/tools/:toolName', controller.mcpTool)
  if (deps.llmClient) {
    router.post('/mcp/cognitive-diagnosis', controller.cognitiveDiagnosis)
  }

  return router
}
