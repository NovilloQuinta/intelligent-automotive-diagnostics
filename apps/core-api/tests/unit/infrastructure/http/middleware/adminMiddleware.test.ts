import { describe, it, expect, vi } from 'vitest'
import { createRequireAdmin } from '@/infrastructure/http/middleware/admin.middleware.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

function buildUser(role: 'user' | 'admin', twoFactorEnabled = true): User {
  return new User({
    id: 1,
    username: 'juan',
    email: new Email('juan@mail.com'),
    passwordHash: '$2b$12$hashed',
    userType: 'individual',
    role,
    createdAt: '2024-01-01T00:00:00Z',
    twoFactorEnabled,
  })
}

function createUserRepo(user: User | null): UserRepository {
  return {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(user),
    create: vi.fn(),
    incrementFailedLogin: vi.fn(),
    resetFailedLogins: vi.fn(),
  }
}

function createMockRes() {
  const res: Record<string, unknown> = {}
  res.status = vi.fn().mockReturnValue(res)
  res.json = vi.fn().mockReturnValue(res)
  return res
}

describe('createRequireAdmin', () => {
  it('should respond 401 when req.userId is not set (no authMiddleware ran before)', async () => {
    const userRepo = createUserRepo(null)
    const middleware = createRequireAdmin(userRepo)
    const req = {} as Record<string, unknown>
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(userRepo.findById).not.toHaveBeenCalled()
  })

  it('should respond 403 when the authenticated user has role "user"', async () => {
    const userRepo = createUserRepo(buildUser('user'))
    const middleware = createRequireAdmin(userRepo)
    const req = { userId: 1 } as Record<string, unknown>
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('should call next when the authenticated user has role "admin"', async () => {
    const userRepo = createUserRepo(buildUser('admin'))
    const middleware = createRequireAdmin(userRepo)
    const req = { userId: 1 } as Record<string, unknown>
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as never, res as never, next)

    expect(next).toHaveBeenCalledTimes(1)
    expect(res.status).not.toHaveBeenCalled()
  })

  it('should respond 401, not 403, when req.userId does not match any user (deleted account)', async () => {
    const userRepo = createUserRepo(null)
    const middleware = createRequireAdmin(userRepo)
    const req = { userId: 999 } as Record<string, unknown>
    const res = createMockRes()
    const next = vi.fn()

    await middleware(req as never, res as never, next)

    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
    expect(userRepo.findById).toHaveBeenCalledWith(999)
  })

  describe('segundo factor obligatorio para administradores', () => {
    it('deniega 403 a un admin que no ha activado el segundo factor', async () => {
      // El panel expone todos los usuarios, los logs y la auditoria: una sola
      // contrasena robada no puede bastar para llegar ahi.
      const userRepo = createUserRepo(buildUser('admin', false))
      const middleware = createRequireAdmin(userRepo)
      const res = createMockRes()
      const next = vi.fn()

      await middleware({ userId: 1 } as never, res as never, next)

      expect(next).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(403)
    })

    it('el motivo se distingue del 403 por falta de rol', async () => {
      const withoutTwoFactor = createMockRes()
      const withoutRole = createMockRes()

      await createRequireAdmin(createUserRepo(buildUser('admin', false)))(
        { userId: 1 } as never,
        withoutTwoFactor as never,
        vi.fn(),
      )
      await createRequireAdmin(createUserRepo(buildUser('user')))(
        { userId: 1 } as never,
        withoutRole as never,
        vi.fn(),
      )

      const bodyOf = (res: ReturnType<typeof createMockRes>) =>
        (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0] as { error: string }
      expect(bodyOf(withoutTwoFactor).error).not.toBe(bodyOf(withoutRole).error)
    })

    it('deja pasar al admin que si lo tiene activo', async () => {
      const userRepo = createUserRepo(buildUser('admin', true))
      const middleware = createRequireAdmin(userRepo)
      const res = createMockRes()
      const next = vi.fn()

      await middleware({ userId: 1 } as never, res as never, next)

      expect(next).toHaveBeenCalledTimes(1)
    })

    it('a un usuario sin rol admin le sigue faltando el rol, tenga o no 2FA', async () => {
      const userRepo = createUserRepo(buildUser('user', true))
      const middleware = createRequireAdmin(userRepo)
      const res = createMockRes()

      await middleware({ userId: 1 } as never, res as never, vi.fn())

      expect(res.status).toHaveBeenCalledWith(403)
    })
  })
})
