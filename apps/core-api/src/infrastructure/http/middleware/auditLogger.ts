import type { Request, Response, NextFunction } from 'express'

/** Contrato minimo que necesita el audit logger para persistir registros. */
export interface AuditLogRepository {
  create(input: {
    method: string
    path: string
    statusCode: number
    ip?: string | null
    userAgent?: string | null
    durationMs?: number | null
  }): Promise<unknown>
}

/** Crea un middleware Express que registra cada request en el repositorio de auditoria. */
export function createAuditLogger(repo: AuditLogRepository) {
  return function auditLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now()

    res.once('finish', () => {
      const durationMs = Date.now() - start
      const entry = {
        method: req.method ?? 'UNKNOWN',
        path: req.path ?? req.url ?? '/',
        statusCode: res.statusCode ?? 0,
        ip: req.ip ?? null,
        userAgent: (req.headers?.['user-agent'] as string) ?? null,
        durationMs,
      }

      repo.create(entry).catch((err: unknown) => {
        console.error('Audit log write failed:', err)
      })
    })

    next()
  }
}
