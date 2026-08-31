import { Router } from 'express'
import { createRateLimiter } from '@/infrastructure/http/middleware/rate-limiter.middleware.js'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/**
 * Telemetria en vivo: el poller del front pide cada 1000ms exactos
 * (`LIVE_TELEMETRY_INTERVAL_MS`), 5 peticiones nominales en esta ventana de 5s.
 * 8 se probo insuficiente en produccion: el refetch-on-focus de React Query
 * (una peticion extra cada vez que se vuelve a la pestaña) mas el jitter normal
 * bastaban para agotarlo con un solo usuario, sin abuso de por medio. 20 deja
 * 4x de margen sobre el nominal y sigue frenando un poller real que ignore el
 * intervalo.
 */
const liveDataRateLimit = createRateLimiter({
  namespace: 'live-data',
  windowMinutes: 5 / 60,
  maxRequests: 20,
})

/** 30 peticiones/min para el historial: listado + detalle (misma ventana, mismo limite). */
const historyRateLimit = createRateLimiter({
  namespace: 'diagnosis-history',
  windowMinutes: 1,
  maxRequests: 30,
})

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(controller: DiagnosisController): Router {
  const router = Router()

  router.get('/scenarios', controller.listScenarios)
  router.get('/available-pids', controller.availablePids)
  router.get('/mcp/capabilities', controller.capabilities)
  router.post('/diagnosis', controller.diagnose)
  router.get('/freeze-frame', controller.freezeFrame)
  router.get('/ecu-info', controller.ecuInfo)
  router.get('/vehicle-info', controller.vehicleInfo)
  router.post('/vehicle-identity', controller.confirmVehicleIdentity)
  router.get('/live-data', liveDataRateLimit, controller.liveData)
  router.post('/mcp/tools/:toolName', controller.mcpTool)
  router.post('/mcp/cognitive-diagnosis', controller.cognitiveDiagnosis)
  router.post('/clear-dtc', controller.clearDtc)
  router.get('/pending-dtc', controller.pendingDtc)
  router.get('/permanent-dtc', controller.permanentDtc)
  router.get('/vehicle-status', controller.vehicleStatus)
  router.get('/diagnosis-history', historyRateLimit, controller.listHistory)
  router.get('/diagnosis-history/:id', historyRateLimit, controller.getHistoryDetail)

  return router
}
