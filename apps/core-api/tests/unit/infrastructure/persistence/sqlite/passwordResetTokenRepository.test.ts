import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { Email } from '@/domain/value-objects/Email.js'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      user_type TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      business_name TEXT,
      tax_id TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      used_at TEXT
    );
  `)

  return drizzle(sqlite)
}

describe('SqlitePasswordResetTokenRepository', () => {
  let repo: SqlitePasswordResetTokenRepository
  let userId: number

  beforeEach(async () => {
    const db = createTestDb()
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
