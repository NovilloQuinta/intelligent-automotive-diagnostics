import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { LogRepository } from '@/application/ports/LogRepository.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { AdminOverview } from '@/application/dto/admin/AdminOverview.js'

/** Ventana por defecto para "errores recientes": ultimas 24 horas. */
const RECENT_ERRORS_WINDOW_MS = 24 * 60 * 60 * 1000

/** Dependencias del resumen general del panel de administracion. */
export interface AdminOverviewDeps {
  readonly userRepo: UserRepository
  readonly logRepo: LogRepository
  readonly auditRepo: AuditLogRepository
}

/**
 * Caso de uso: agrega totales de usuarios, errores recientes y actividad HTTP para
 * `GET /api/admin/overview`.
 *
 * La actividad HTTP (`httpRequestsByPathApprox`) se deriva de `audit_logs` agrupado por
 * ruta: es un proxy de trafico, no de diagnosticos reales (no existe esa tabla todavia —
 * ver `proposal.md`, Fuera de alcance). El nombre del campo ya lo deja explicito; la UI y
 * Swagger (Bloque C/D) deben mantener esa etiqueta.
 */
export class GetAdminOverviewUseCase {
  constructor(
    private readonly deps: AdminOverviewDeps,
    private readonly recentErrorsWindowMs: number = RECENT_ERRORS_WINDOW_MS,
  ) {}

  async execute(): Promise<AdminOverview> {
    const since = new Date(Date.now() - this.recentErrorsWindowMs).toISOString()

    const [userStats, recentErrors, auditStats] = await Promise.all([
      this.deps.userRepo.stats(),
      this.deps.logRepo.list({ page: 1, pageSize: 1, level: 'error', from: since }),
      this.deps.auditRepo.stats({}),
    ])

    return {
      userStats,
      recentErrorCount: recentErrors.total,
      httpRequestsByPathApprox: auditStats.byPath,
    }
  }
}
