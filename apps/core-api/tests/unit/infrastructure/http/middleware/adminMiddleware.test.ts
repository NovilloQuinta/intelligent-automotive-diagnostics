import { describe, it, expect, vi } from 'vitest'
import { createRequireAdmin } from '@/infrastructure/http/middleware/admin.middleware.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/User.js'
import { Email } from '@/domain/value-objects/Email.js'

function buildUser(role: 'user' | 'admin'): User {
  return new User({
    id: 1,
    username: 'juan',
    email: new Email('juan@mail.com'),
    passwordHash: '$2b$12$hashed',
    userType: 'individual',
    role,
    createdAt: '2024-01-01T00:00:00Z',
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
})
