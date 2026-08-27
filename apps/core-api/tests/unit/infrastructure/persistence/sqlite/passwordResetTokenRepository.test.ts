import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { Email } from '@/domain/value-objects/Email.js'

describe('SqlitePasswordResetTokenRepository', () => {
  let repo: SqlitePasswordResetTokenRepository
  let userId: number

  beforeEach(async () => {
    resetDb()
    const db = getDb()
    repo = new SqlitePasswordResetTokenRepository(db)
    const userRepo = new SqliteUserRepository(db)
    const user = await userRepo.create({
      username: 'reseter',
      email: new Email('reseter@example.com'),
      passwordHash: '$2b$12$hashed',
      userType: 'individual',
    })
    userId = user.id
  })

  afterEach(() => {
    resetDb()
  })

  describe('save + findByTokenHash', () => {
    it('devuelve null si el hash no existe', async () => {
      const found = await repo.findByTokenHash('nonexistent-hash')
      expect(found).toBeNull()
    })

    it('persiste y encuentra un token por su hash', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await repo.save(userId, 'hash-abc', expiresAt)

      const found = await repo.findByTokenHash('hash-abc')

      expect(found).not.toBeNull()
      expect(found!.userId).toBe(userId)
      expect(found!.tokenHash).toBe('hash-abc')
      expect(found!.expiresAt).toBe(expiresAt)
      expect(found!.usedAt).toBeNull()
    })
  })

  describe('markUsed', () => {
    it('marca un token como usado', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await repo.save(userId, 'hash-used', expiresAt)

      await repo.markUsed('hash-used')

      const found = await repo.findByTokenHash('hash-used')
      expect(found!.usedAt).not.toBeNull()
    })
  })

  describe('invalidateAllForUser', () => {
    it('marca como usados todos los tokens no usados de un usuario', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await repo.save(userId, 'hash-1', expiresAt)
      await repo.save(userId, 'hash-2', expiresAt)

      await repo.invalidateAllForUser(userId)

      const first = await repo.findByTokenHash('hash-1')
      const second = await repo.findByTokenHash('hash-2')
      expect(first!.usedAt).not.toBeNull()
      expect(second!.usedAt).not.toBeNull()
    })

    it('no afecta a tokens de otros usuarios', async () => {
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
      await repo.save(userId, 'hash-mine', expiresAt)

      await repo.invalidateAllForUser(userId + 999)

      const mine = await repo.findByTokenHash('hash-mine')
      expect(mine!.usedAt).toBeNull()
    })
  })
})
