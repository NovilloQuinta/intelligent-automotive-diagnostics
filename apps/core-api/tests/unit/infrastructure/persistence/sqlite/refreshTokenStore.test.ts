import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { Email } from '@/domain/value-objects/email.js'

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
      business_name TEXT,
      tax_id TEXT,
      address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT
    );
  `)

  return drizzle(sqlite)
}

describe('SqliteRefreshTokenStore', () => {
  let store: SqliteRefreshTokenStore
  let userId: number

  beforeEach(async () => {
    const db = createTestDb()
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
