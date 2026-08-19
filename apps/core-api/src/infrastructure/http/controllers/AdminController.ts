import type { Request, Response } from 'express'
import { adminLogsFilterSchema } from '@/application/dto/admin/AdminLogsFilter.js'
import { adminAuditFilterSchema } from '@/application/dto/admin/AdminAuditFilter.js'
import { adminUsersFilterSchema } from '@/application/dto/admin/AdminUsersFilter.js'
import { knowledgeSearchInputSchema } from '@/application/dto/admin/KnowledgeSearchInput.js'
import type { GetAdminOverviewUseCase } from '@/application/use-cases/admin/GetAdminOverviewUseCase.js'
import type { ListSystemLogsUseCase } from '@/application/use-cases/admin/ListSystemLogsUseCase.js'
import type { ListAuditLogsUseCase } from '@/application/use-cases/admin/ListAuditLogsUseCase.js'
import type { ListUsersUseCase } from '@/application/use-cases/admin/ListUsersUseCase.js'
import type { GetKnowledgeStatsUseCase } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { KnowledgeStackPort } from '@/application/ports/KnowledgeStackPort.js'
import { respondIfValidationError, respondInternalError } from './httpErrors.js'

const ERROR_MESSAGES = {
  knowledgeUnavailable: 'Knowledge stack is not available',
} as const

/** Casos de uso y dependencias que consume {@link AdminController}. */
export interface AdminControllerDeps {
  readonly getOverview: GetAdminOverviewUseCase
  readonly listLogs: ListSystemLogsUseCase
  readonly listAuditLogs: ListAuditLogsUseCase
  readonly listUsers: ListUsersUseCase
  /** `undefined` cuando el catalogo vectorial no esta disponible (ver `createKnowledgeStack`). */
  readonly getKnowledgeStats?: GetKnowledgeStatsUseCase
  readonly knowledgeStack?: KnowledgeStackPort
}

/** Mapa nombre corto de indice -> clave en {@link KnowledgeStackPort}. */
const KNOWLEDGE_STACK_KEY = {
  pids: 'pidsIndex',
  dtcs: 'dtcsIndex',
  diagnoses: 'diagnosisIndex',
} as const

/**
 * Controlador HTTP para `/api/admin/*`.
 *
 * Solo parsea/valida/delega: la agregacion y el filtrado viven en los casos de uso y
 * repositorios (Bloque B). Todas las rutas ya llegan protegidas por `requireAdmin` (ver
 * `admin.routes.ts`), asi que este controlador no vuelve a comprobar el rol.
 */
export class AdminController {
  constructor(private readonly deps: AdminControllerDeps) {}

  /** GET /api/admin/overview — resumen general del panel. */
  overview = async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await this.deps.getOverview.execute()
      res.status(200).json(result)
    } catch {
      respondInternalError(res)
    }
  }

  /** GET /api/admin/logs — logs de aplicacion filtrados/paginados. 400 query invalida. */
  logs = async (req: Request, res: Response): Promise<void> => {
    try {
      const filter = adminLogsFilterSchema.parse(req.query)
      const result = await this.deps.listLogs.execute(filter)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }

  /** GET /api/admin/audit-logs — auditoria HTTP filtrada/paginada. 400 query invalida. */
  auditLogs = async (req: Request, res: Response): Promise<void> => {
    try {
      const filter = adminAuditFilterSchema.parse(req.query)
      const result = await this.deps.listAuditLogs.execute(filter)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }

  /** GET /api/admin/users — usuarios filtrados/paginados, sin `passwordHash`. 400 query invalida. */
  users = async (req: Request, res: Response): Promise<void> => {
    try {
      const filter = adminUsersFilterSchema.parse(req.query)
      const result = await this.deps.listUsers.execute(filter)
      res.status(200).json(result)
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }

  /** GET /api/admin/knowledge — conteo y muestra de los tres indices vectoriales. */
  knowledge = async (_req: Request, res: Response): Promise<void> => {
    if (!this.deps.getKnowledgeStats) {
      res.status(503).json({ error: ERROR_MESSAGES.knowledgeUnavailable })
      return
    }

    try {
      const result = await this.deps.getKnowledgeStats.execute()
      res.status(200).json(result)
    } catch {
      respondInternalError(res)
    }
  }

  /**
   * POST /api/admin/knowledge/search — busqueda de prueba contra el catalogo vectorial.
   * Usa el mismo `VectorRepository.search()` (embed + `VectorStorePort.query()`) que el flujo
   * RAG real, para que el resultado sea representativo de lo que devolveria el diagnostico.
   */
  searchKnowledge = async (req: Request, res: Response): Promise<void> => {
    try {
      const input = knowledgeSearchInputSchema.parse(req.body)

      if (!this.deps.knowledgeStack) {
        res.status(503).json({ error: ERROR_MESSAGES.knowledgeUnavailable })
        return
      }

      const indexKey = KNOWLEDGE_STACK_KEY[input.index]
      const results = await this.deps.knowledgeStack[indexKey].search(input.text, {
        limit: input.limit,
      })
      res.status(200).json({ results })
    } catch (err) {
      if (respondIfValidationError(err, res)) return
      respondInternalError(res)
    }
  }
}
