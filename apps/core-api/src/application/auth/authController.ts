import { z } from 'zod'
import type { Request, Response } from 'express'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthService } from '@/infrastructure/auth/authService.js'
import type { RefreshTokenStore } from '@/infrastructure/auth/authService.js'

const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  userType: z.enum(['individual', 'workshop']),
  businessName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

interface AuthControllerDeps {
  readonly userRepo: UserRepository
  readonly authService: AuthService
  readonly tokenStore: RefreshTokenStore
}

/** Crea un controlador de autenticacion con sus dependencias inyectadas. */
export function createAuthController(deps: AuthControllerDeps) {
  const { userRepo, authService, tokenStore } = deps

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

  return {
    async register(req: Request, res: Response): Promise<void> {
      const parsed = registerSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
        return
      }

      const { username, email, password, userType, businessName, taxId, address } = parsed.data

      const existing = await userRepo.findByEmail(email)
      if (existing) {
        res.status(409).json({ error: 'Email already registered' })
        return
      }

      const passwordHash = await authService.hashPassword(password)
      const user = await userRepo.create({
        username,
        email,
        passwordHash,
        userType,
        businessName: businessName ?? null,
        taxId: taxId ?? null,
        address: address ?? null,
      })

      const tokens = authService.generateTokens(user.id)
      const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
      const { createHash } = await import('node:crypto')
      const tokenHash = createHash('sha256').update(tokens.refreshToken).digest('hex')
      await tokenStore.saveRefreshToken(user.id, tokenHash, expiresAt)

      res.status(201).json({
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          userType: user.userType,
          businessName: user.businessName,
          taxId: user.taxId,
          address: user.address,
          createdAt: user.createdAt,
        },
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },

    async login(req: Request, res: Response): Promise<void> {
      const parsed = loginSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
        return
      }

      const { email, password } = parsed.data

      const user = await userRepo.findByEmail(email)
      if (!user) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }

      const valid = await authService.comparePassword(password, user.passwordHash)
      if (!valid) {
        res.status(401).json({ error: 'Invalid credentials' })
        return
      }

      const tokens = authService.generateTokens(user.id)
      const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString()
      const { createHash } = await import('node:crypto')
      const tokenHash = createHash('sha256').update(tokens.refreshToken).digest('hex')
      await tokenStore.saveRefreshToken(user.id, tokenHash, expiresAt)

      res.status(200).json({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      })
    },

    async refresh(req: Request, res: Response): Promise<void> {
      const parsed = refreshSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', details: parsed.error.issues })
        return
      }

      const { refreshToken } = parsed.data

      try {
        const tokens = await authService.refreshAccessToken(refreshToken)
        res.status(200).json(tokens)
      } catch {
        res.status(401).json({ error: 'Invalid refresh token' })
      }
    },
  }
}
