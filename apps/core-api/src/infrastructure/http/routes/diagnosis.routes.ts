import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/** 1 peticion/s por cliente para el endpoint de telemetria en vivo. */
const liveDataRateLimit = rateLimit({
  windowMs: 1000,
  limit: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many live-data requests, please wait.' },
})

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(controller: DiagnosisController): Router {
  const router = Router()

  router.get('/scenarios', controller.listScenarios)
  router.get('/mcp/capabilities', controller.capabilities)
  router.post('/diagnosis', controller.diagnose)
  router.get('/freeze-frame', controller.freezeFrame)
  router.get('/ecu-info', controller.ecuInfo)
  router.get('/vehicle-info', controller.vehicleInfo)
  router.get('/live-data', liveDataRateLimit, controller.liveData)
  router.post('/mcp/tools/:toolName', controller.mcpTool)
  router.post('/mcp/cognitive-diagnosis', controller.cognitiveDiagnosis)

  return router
}
