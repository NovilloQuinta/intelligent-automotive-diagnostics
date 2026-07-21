import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createAuthController } from '@/application/auth/authController.js'
import { ZodError } from 'zod'
import { EmailAlreadyRegisteredError } from '@/application/use-cases/registerUser.js'
import { InvalidCredentialsError } from '@/application/use-cases/loginUser.js'

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

const validLoginInput = {
  email: 'juan@mail.com',
  password: 'Pass1234!',
}

describe('authController', () => {
  let registerUser: ReturnType<typeof vi.fn>
  let loginUser: ReturnType<typeof vi.fn>
  let refreshToken: ReturnType<typeof vi.fn>
  let controller: ReturnType<typeof createAuthController>

  beforeEach(() => {
    registerUser = vi.fn().mockResolvedValue({
      user: { id: 1, username: 'juan', email: 'juan@mail.com', userType: 'individual', createdAt: '2024-01-01T00:00:00Z' },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    loginUser = vi.fn().mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })
    refreshToken = vi.fn().mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })

    controller = createAuthController({ registerUser, loginUser, refreshToken })
  })

  describe('register', () => {
    it('should return 201 with user and tokens on success', async () => {
      const req = createMockReq(validRegisterInput)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      )
    })

    it('should return 409 when email is duplicated', async () => {
      registerUser.mockRejectedValue(new EmailAlreadyRegisteredError('juan@mail.com'))

      const req = createMockReq(validRegisterInput)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(409)
    })

    it('should return 400 when validation fails', async () => {
      registerUser.mockRejectedValue(new ZodError([]))

      const req = createMockReq({ username: 'x' })
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('should return 500 on unexpected errors', async () => {
      registerUser.mockRejectedValue(new Error('DB down'))

      const req = createMockReq(validRegisterInput)
      const res = createMockRes()

      await controller.register(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('login', () => {
    it('should return 200 with tokens on success', async () => {
      const req = createMockReq(validLoginInput)
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      )
    })

    it('should return 401 with invalid credentials', async () => {
      loginUser.mockRejectedValue(new InvalidCredentialsError())

      const req = createMockReq({ email: 'x@x.com', password: 'wrong' })
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('should return 400 when validation fails', async () => {
      loginUser.mockRejectedValue(new ZodError([]))

      const req = createMockReq({})
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })

    it('should return 500 on unexpected errors', async () => {
      loginUser.mockRejectedValue(new Error('DB down'))

      const req = createMockReq(validLoginInput)
      const res = createMockRes()

      await controller.login(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(500)
    })
  })

  describe('refresh', () => {
    it('should return 200 with new tokens on success', async () => {
      const req = createMockReq({ refreshToken: 'valid-token' })
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
        }),
      )
    })

    it('should return 401 when refresh token is invalid', async () => {
      refreshToken.mockRejectedValue(new Error('Refresh token not found'))

      const req = createMockReq({ refreshToken: 'bad-token' })
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(401)
    })

    it('should return 400 when validation fails', async () => {
      refreshToken.mockRejectedValue(new ZodError([]))

      const req = createMockReq({})
      const res = createMockRes()

      await controller.refresh(req as never, res as never)

      expect(res.status).toHaveBeenCalledWith(400)
    })
  })
})
