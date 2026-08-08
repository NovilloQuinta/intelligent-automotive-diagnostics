import { describe, it, expect } from 'vitest'
import { toSafeUser } from '@/application/shared/safeUser.js'
import { User } from '@/domain/entities/user.js'
import { Email } from '@/domain/value-objects/email.js'

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

describe('toSafeUser', () => {
  it('should omit passwordHash', () => {
    const safe = toSafeUser(buildUser('user'))

    expect(safe).not.toHaveProperty('passwordHash')
  })

  it('should preserve role and isAdmin for a regular user', () => {
    const safe = toSafeUser(buildUser('user'))

    expect(safe.role).toBe('user')
    expect(safe.isAdmin).toBe(false)
  })

  it('should preserve role and isAdmin for an admin', () => {
    const safe = toSafeUser(buildUser('admin'))

    expect(safe.role).toBe('admin')
    expect(safe.isAdmin).toBe(true)
  })
})
