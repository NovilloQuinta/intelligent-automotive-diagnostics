import type { Request, Response, NextFunction } from 'express'
import type { UserRepository } from '@/application/ports/UserRepository.js'

const ERROR_MESSAGES = {
  accessTokenRequired: 'Access token required',
  adminRoleRequired: 'Admin role required',
} as const

/**
 * Crea un middleware que exige rol de administrador.
 *
 * Se monta despues de `authMiddleware` (que ya puso `req.userId` a partir del
 * JWT). El rol NUNCA se lee de un claim del token: se resuelve consultando
 * `userRepo.findById(req.userId)` en cada peticion, para que revocar un rol
 * surta efecto de inmediato sin esperar a que expire el access token.
 */
export function createRequireAdmin(userRepo: UserRepository) {
  return async function requireAdmin(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (typeof req.userId !== 'number') {
      res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
      return
    }

    const user = await userRepo.findById(req.userId)
    if (!user) {
      // El usuario del token ya no existe (p. ej. cuenta borrada): 401, no 403,
      // porque no hay identidad autenticada valida, no solo falta de permiso.
      res.status(401).json({ error: ERROR_MESSAGES.accessTokenRequired })
      return
    }

    if (!user.isAdmin) {
      res.status(403).json({ error: ERROR_MESSAGES.adminRoleRequired })
      return
    }

    next()
  }
}
