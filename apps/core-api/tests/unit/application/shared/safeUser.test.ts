import { describe, it, expect } from 'vitest'
import { toSafeUser, stripPasswordHash } from '@/application/shared/safeUser.js'
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

describe('stripPasswordHash', () => {
  it('should remove passwordHash while keeping the other fields', () => {
    const stripped = stripPasswordHash({ id: 1, username: 'juan', passwordHash: '$2b$12$hashed' })

    expect(stripped).not.toHaveProperty('passwordHash')
    expect(stripped).toEqual({ id: 1, username: 'juan' })
  })

  it('should be a no-op when passwordHash is already absent', () => {
    const stripped = stripPasswordHash({ id: 1, username: 'juan' })

    expect(stripped).toEqual({ id: 1, username: 'juan' })
  })
})

describe('toSafeUser — ningun secreto se cuela en la proyeccion publica', () => {
  /**
   * `toSafeUser` incluye por exclusion: `{ passwordHash, ...resto }`. Cualquier campo
   * que se anada a `User` se publica solo por existir, sin que nadie escriba una linea
   * para exponerlo. Este test es lo que convierte ese descuido en un fallo de la suite.
   */
  const user = new User({
    id: 1,
    username: 'taller',
    email: new Email('taller@example.com'),
    passwordHash: 'hash-bcrypt',
    userType: 'workshop',
    createdAt: '2026-08-26T10:00:00.000Z',
    twoFactorEnabled: true,
  })

  it('no expone el hash de contrasena', () => {
    expect(toSafeUser(user)).not.toHaveProperty('passwordHash')
  })

  it('no expone ninguna clave cuyo nombre huela a secreto', () => {
    const leaked = Object.keys(toSafeUser(user)).filter((key) => /secret|token|password/i.test(key))

    expect(leaked).toEqual([])
  })

  it('si expone si el segundo factor esta activo, que la UI necesita', () => {
    expect(toSafeUser(user).twoFactorEnabled).toBe(true)
  })
})
