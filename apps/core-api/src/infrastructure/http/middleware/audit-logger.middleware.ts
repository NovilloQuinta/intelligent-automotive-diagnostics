import type { Request, Response, NextFunction } from 'express'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'

/** Prefijo excluido de auditoria: consultar el propio panel no debe generar ruido recursivo. */
const EXCLUDED_PREFIX = '/api/admin'

/**
 * Indica si una ruta no debe auditarse.
 *
 * Compara por segmento (`/api/admin` o `/api/admin/...`), no por `startsWith` a secas,
 * para no excluir por error una ruta que solo comparte el prefijo de texto (p. ej.
 * `/api/administration`).
 */
export function isExcludedFromAudit(path: string): boolean {
  return path === EXCLUDED_PREFIX || path.startsWith(`${EXCLUDED_PREFIX}/`)
}

/**
 * Extrae la ruta completa (sin query string) de la peticion.
 *
 * `req.originalUrl` sobrevive al montaje en un sub-router (p. ej. `/api/admin`): Express
 * reescribe `req.path`/`req.url` a la ruta relativa al montaje mientras la peticion esta
 * dentro de ese router, y si la respuesta se envia sin volver a subir por la cadena de
 * middlewares, ese valor reescrito es el que ve este listener en `finish`. Usar `req.path`
 * aqui guardaria `/overview` en vez de `/api/admin/overview` — rompiendo en silencio tanto
 * la exclusion de `/api/admin/*` como cualquier filtro por `path` en `audit_logs`.
 */
function resolveFullPath(req: Request): string {
  const raw = req.originalUrl ?? req.url ?? req.path ?? '/'
  return raw.split('?')[0] || '/'
}

/** Crea un middleware Express que registra cada request en el repositorio de auditoria. */
export function createAuditLogger(repo: AuditLogRepository) {
  return function auditLoggerMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now()

    res.once('finish', () => {
      const path = resolveFullPath(req)
      if (isExcludedFromAudit(path)) {
        return
      }

      const durationMs = Date.now() - start
      const entry = {
        method: req.method ?? 'UNKNOWN',
        path,
        statusCode: res.statusCode ?? 0,
        ip: req.ip ?? null,
        userAgent: (req.headers?.['user-agent'] as string) ?? null,
        durationMs,
        userId: req.userId ?? null,
      }

      repo.create(entry).catch((err: unknown) => {
        console.error('Audit log write failed:', err)
      })
    })

    next()
  }
}
