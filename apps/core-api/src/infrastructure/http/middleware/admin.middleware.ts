import type { Request, Response, NextFunction } from 'express'
import type { UserRepository } from '@/application/ports/UserRepository.js'

const ERROR_MESSAGES = {
  accessTokenRequired: 'Access token required',
  adminRoleRequired: 'Admin role required',
  twoFactorRequired: 'Two-factor authentication must be enabled to access the admin panel',
} as const

/**
 * Crea un middleware que exige rol de administrador.
 *
 * Se monta despues de `authMiddleware` (que ya puso `req.userId` a partir del
 * JWT). El rol NUNCA se lee de un claim del token: se resuelve consultando
 * `userRepo.findById(req.userId)` en cada peticion, para que revocar un rol
 * surta efecto de inmediato sin esperar a que expire el access token.
 *
 * Exige ademas segundo factor activo. El panel expone el listado completo de
 * usuarios, los logs y la auditoria: una contrasena robada no puede bastar para
 * llegar ahi. El motivo va con un mensaje propio para que la UI pueda mandar al
 * administrador a activarlo, en vez de dejarle ante un 403 sin explicacion. El
 * resto de la aplicacion le sigue abierta, que es donde esta esa pantalla.
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

    if (!user.twoFactorEnabled) {
      res.status(403).json({ error: ERROR_MESSAGES.twoFactorRequired, twoFactorRequired: true })
      return
    }

    next()
  }
}
