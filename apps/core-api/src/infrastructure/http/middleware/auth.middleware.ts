import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'

declare module 'express' {
  interface Request {
    userId?: number
  }
}

const BEARER_PREFIX = 'Bearer '
const BEARER_PREFIX_LENGTH = BEARER_PREFIX.length

/** Crea un middleware que verifica el JWT del header Authorization y extrae el userId. */
export function createAuthMiddleware(accessTokenSecret: string) {
  return function authenticateToken(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.get('authorization')
    if (!authHeader || !authHeader.startsWith(BEARER_PREFIX)) {
      res.status(401).json({ error: 'Access token required' })
      return
    }

    const token = authHeader.slice(BEARER_PREFIX_LENGTH)

    try {
      const decoded = jwt.verify(token, accessTokenSecret) as unknown as { sub: number }
      req.userId = decoded.sub
      next()
    } catch (err: unknown) {
      const message =
        err instanceof jwt.TokenExpiredError ? 'Access token expired' : 'Invalid access token'
      res.status(401).json({ error: message })
    }
  }
}
