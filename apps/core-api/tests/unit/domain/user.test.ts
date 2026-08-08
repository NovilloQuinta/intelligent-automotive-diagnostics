import { describe, it, expect } from 'vitest'
import { User } from '@/domain/entities/user.js'
import { Email } from '@/domain/value-objects/email.js'

function buildUser(overrides: Partial<ConstructorParameters<typeof User>[0]> = {}): User {
  return new User({
    id: 1,
    username: 'juan',
    email: new Email('juan@mail.com'),
    passwordHash: '$2b$12$hashed',
    userType: 'individual',
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  })
}

describe('User', () => {
  it('should default role to "user" when not provided', () => {
    const user = buildUser()

    expect(user.role).toBe('user')
    expect(user.isAdmin).toBe(false)
  })

  it('should accept role "admin" and expose isAdmin as true', () => {
    const user = buildUser({ role: 'admin' })

    expect(user.role).toBe('admin')
    expect(user.isAdmin).toBe(true)
  })

  it('should expose isAdmin as false for role "user"', () => {
    const user = buildUser({ role: 'user' })

    expect(user.isAdmin).toBe(false)
  })
})
