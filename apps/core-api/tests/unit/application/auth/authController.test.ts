import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuthController } from '@/application/auth/authController.js'
import type { UserRepository } from '@/application/ports/userRepository.interface.js'
import type { AuthService } from '@/infrastructure/auth/authService.js'
import type { RefreshTokenStore } from '@/infrastructure/auth/authService.js'

function createMockReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    body,
    headers,
    ip: '127.0.0.1',
  }
}

function createMockRes() {
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  res.setHeader = vi.fn()
  return res
}

const validRegisterInput = {
  username: 'juan',
  email: 'juan@mail.com',
  password: 'Pass1234!',
  userType: 'individual' as const,
}

const validWorkshopInput = {
  username: 'taller1',
  email: 'taller@mail.com',
  password: 'Pass1234!',
  userType: 'workshop' as const,
  businessName: 'Talleres AutoFix',
  taxId: 'B12345678',
  address: 'Calle 123',
}

const validLoginInput = {
  email: 'juan@mail.com',
  password: 'Pass1234!',
}

describe('authController', () => {
  let userRepo: UserRepository
  let authService: AuthService
  let tokenStore: RefreshTokenStore
  let controller: ReturnType<typeof createAuthController>

  beforeEach(() => {
    userRepo = {
      findByEmail: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 1,
        username: 'juan',
        email: 'juan@mail.com',
        passwordHash: '$2b$12$hashed',
        userType: 'individual',
        businessName: null,
        taxId: null,
        address: null,
        createdAt: '2024-01-01T00:00:00Z',
      }),
    }

    authService = {
      hashPassword: vi.fn().mockResolvedValue('$2b$12$hashed'),
      comparePassword: vi.fn().mockResolvedValue(true),
      generateTokens: vi.fn().mockReturnValue({
        accessToken: 'access-token-xyz',
        refreshToken: 'refresh-token-xyz',
      }),
      verifyAccessToken: vi.fn().mockReturnValue(42),
      refreshAccessToken: vi.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      }),
    }

    tokenStore = {
      saveRefreshToken: vi.fn().mockResolvedValue(undefined),
      findRefreshToken: vi.fn().mockResolvedValue(null),
      revokeRefreshToken: vi.fn().mockResolvedValue(undefined),
    }

    controller = createAuthController({ userRepo, authService, tokenStore })
  })

  describe('register', () => {
    it('should register an individual user and return tokens', async () => {
      const req = createMockReq(validRegisterInput)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'juan',
          email: 'juan@mail.com',
          userType: 'individual',
        }),
      )
      expect(authService.generateTokens).toHaveBeenCalledWith(1)
      expect(tokenStore.saveRefreshToken).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('should register a workshop with business fields', async () => {
      const workshopUser = {
        ...validWorkshopInput,
      }
      ;(userRepo.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 2,
        username: 'taller1',
        email: 'taller@mail.com',
        passwordHash: '$2b$12$hashed',
        userType: 'workshop',
        businessName: 'Talleres AutoFix',
        taxId: 'B12345678',
        address: 'Calle 123',
        createdAt: '2024-01-01T00:00:00Z',
      })

      const req = createMockReq(workshopUser)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(userRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: 'Talleres AutoFix',
          taxId: 'B12345678',
          address: 'Calle 123',
        }),
      )
      expect(res.status).toHaveBeenCalledWith(201)
    })

    it('should return 409 when email is duplicated', async () => {
      ;(userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        username: 'existing',
        email: 'juan@mail.com',
        passwordHash: 'hash',
        userType: 'individual',
        createdAt: '2024-01-01T00:00:00Z',
      })

      const req = createMockReq(validRegisterInput)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('should return 400 when validation fails', async () => {
      const req = createMockReq({ username: 'x' })
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('login', () => {
    it('should login with valid credentials and return tokens', async () => {
      ;(userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        username: 'juan',
        email: 'juan@mail.com',
        passwordHash: '$2b$12$hashed',
        userType: 'individual',
        createdAt: '2024-01-01T00:00:00Z',
      })

      const req = createMockReq(validLoginInput)
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(authService.comparePassword).toHaveBeenCalledWith('Pass1234!', '$2b$12$hashed')
      expect(authService.generateTokens).toHaveBeenCalledWith(1)
      expect(tokenStore.saveRefreshToken).toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('should return 401 with wrong password', async () => {
      ;(userRepo.findByEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 1,
        username: 'juan',
        email: 'juan@mail.com',
        passwordHash: '$2b$12$hashed',
        userType: 'individual',
        createdAt: '2024-01-01T00:00:00Z',
      })
      ;(authService.comparePassword as ReturnType<typeof vi.fn>).mockResolvedValue(false)

      const req = createMockReq(validLoginInput)
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('should return 401 when email is not found', async () => {
      const req = createMockReq({ email: 'noexiste@mail.com', password: 'x' })
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('should return 400 when validation fails', async () => {
      const req = createMockReq({})
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })

  describe('refresh', () => {
    it('should refresh with valid token and return new pair', async () => {
      const req = createMockReq({ refreshToken: 'valid-refresh-token' })
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(authService.refreshAccessToken).toHaveBeenCalledWith('valid-refresh-token')
      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('should return 401 when refresh token is invalid', async () => {
      ;(authService.refreshAccessToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Refresh token not found'),
      )

      const req = createMockReq({ refreshToken: 'bad-token' })
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('should return 400 when validation fails', async () => {
      const req = createMockReq({})
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
