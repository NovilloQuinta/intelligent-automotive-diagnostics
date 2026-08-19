import { describe, it, expect } from 'vitest'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'
import { Email } from '@/domain/value-objects/Email.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'

const BASE_ROW = {
  id: 1,
  username: 'juan',
  email: 'juan@mail.com',
  passwordHash: '$2b$12$hashed',
  userType: 'individual' as const,
  businessName: null,
  taxId: null,
  address: null,
  createdAt: '2024-01-01T00:00:00Z',
  failedLoginAttempts: 0,
  lockedUntil: null,
}

describe('toUser', () => {
  it('should map the role column to the User entity', () => {
    const user = toUser({ ...BASE_ROW, role: 'admin' })

    expect(user.role).toBe('admin')
    expect(user.isAdmin).toBe(true)
  })

  it('should map role "user" to a non-admin entity', () => {
    const user = toUser({ ...BASE_ROW, role: 'user' })

    expect(user.role).toBe('user')
    expect(user.isAdmin).toBe(false)
  })
})

describe('toCreateValues', () => {
  const baseInput: CreateUserInput = {
    username: 'juan',
    email: new Email('juan@mail.com'),
    passwordHash: '$2b$12$hashed',
    userType: 'individual',
  }

  it('should default role to "user" when not provided', () => {
    const values = toCreateValues(baseInput)

    expect(values.role).toBe('user')
  })

  it('should preserve an explicit role', () => {
    const values = toCreateValues({ ...baseInput, role: 'admin' })

    expect(values.role).toBe('admin')
  })
})
