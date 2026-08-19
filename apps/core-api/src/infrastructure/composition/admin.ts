import { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import { GetAdminOverviewUseCase } from '@/application/use-cases/admin/GetAdminOverviewUseCase.js'
import { ListSystemLogsUseCase } from '@/application/use-cases/admin/ListSystemLogsUseCase.js'
import { ListAuditLogsUseCase } from '@/application/use-cases/admin/ListAuditLogsUseCase.js'
import { ListUsersUseCase } from '@/application/use-cases/admin/ListUsersUseCase.js'
import { GetKnowledgeStatsUseCase } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { PersistenceRepositories } from '@/infrastructure/composition/persistence.js'
import type { KnowledgeStackWithStores } from '@/infrastructure/composition/knowledge.js'

/** Composicion del panel de administracion. */

/** Crea el `AdminController` con sus cinco casos de uso y el catalogo vectorial si existe. */
export function createAdminController(
  repos: Pick<PersistenceRepositories, 'userRepo' | 'logRepo' | 'auditRepo'>,
  knowledgeStack: KnowledgeStackWithStores | undefined,
): AdminController {
  return new AdminController({
    getOverview: new GetAdminOverviewUseCase({
      userRepo: repos.userRepo,
      logRepo: repos.logRepo,
      auditRepo: repos.auditRepo,
    }),
    listLogs: new ListSystemLogsUseCase(repos.logRepo),
    listAuditLogs: new ListAuditLogsUseCase(repos.auditRepo),
    listUsers: new ListUsersUseCase(repos.userRepo),
    getKnowledgeStats: knowledgeStack
      ? new GetKnowledgeStatsUseCase(knowledgeStack.vectorStores)
      : undefined,
    knowledgeStack,
  })
}
