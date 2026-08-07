import { Router } from 'express'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(controller: DiagnosisController): Router {
  const router = Router()

  router.get('/scenarios', controller.listScenarios)
  router.post('/diagnosis', controller.diagnose)
  router.get('/freeze-frame', controller.freezeFrame)
  router.post('/mcp/tools/:toolName', controller.mcpTool)
  router.post('/mcp/cognitive-diagnosis', controller.cognitiveDiagnosis)

  return router
}
