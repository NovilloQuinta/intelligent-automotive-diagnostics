import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { Email } from '@/domain/value-objects/Email.js'

describe('SqliteRefreshTokenStore', () => {
  let store: SqliteRefreshTokenStore
  let userId: number

  beforeEach(async () => {
    resetDb()
    const db = getDb()
    store = new SqliteRefreshTokenStore(db)
    const userRepo = new SqliteUserRepository(db)
    const user = await userRepo.create({
      username: 'tokenuser',
      email: new Email('tokenuser@example.com'),
      passwordHash: '$2b$12$hashed',
      userType: 'individual',
    })
    userId = user.id
  })

  afterEach(() => {
    resetDb()
  })

  describe('revokeAllForUser', () => {
    it('revoca todos los refresh tokens activos del usuario', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await store.saveRefreshToken(userId, 'hash-1', expiresAt)
      await store.saveRefreshToken(userId, 'hash-2', expiresAt)

      await store.revokeAllForUser(userId)

      const first = await store.findRefreshToken('hash-1')
      const second = await store.findRefreshToken('hash-2')
      expect(first!.revokedAt).not.toBeNull()
      expect(second!.revokedAt).not.toBeNull()
    })

    it('no afecta a tokens de otros usuarios', async () => {
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      await store.saveRefreshToken(userId, 'hash-mine', expiresAt)

      await store.revokeAllForUser(userId + 999)

      const mine = await store.findRefreshToken('hash-mine')
      expect(mine!.revokedAt).toBeNull()
    })
  })
})
