import { Router } from 'express'
import type { AdminController } from '@/infrastructure/http/controllers/AdminController.js'

/**
 * Rutas de administracion. `authMiddleware` y `requireAdmin` se montan en `server.ts`
 * antes de este router (ver `mountAdminRoutes`): aqui solo se define el mapeo ruta -> metodo.
 */
export function createAdminRoutes(controller: AdminController): Router {
  const router = Router()

  router.get('/overview', controller.overview)
  router.get('/logs', controller.logs)
  router.get('/audit-logs', controller.auditLogs)
  router.get('/users', controller.users)
  router.get('/knowledge', controller.knowledge)
  router.post('/knowledge/search', controller.searchKnowledge)

  return router
}
