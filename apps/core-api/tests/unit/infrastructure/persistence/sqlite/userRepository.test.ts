import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import type { CreateUserInput } from '@/domain/user.js'

const mockUser: CreateUserInput = {
  username: 'testuser',
  email: 'test@example.com',
  passwordHash: '$2b$12$hashedpasswordvaluehere',
  userType: 'individual',
}

const mockWorkshop: CreateUserInput = {
  username: 'tallercars',
  email: 'taller@example.com',
  passwordHash: '$2b$12$anotherhashedvalue',
  userType: 'workshop',
  businessName: 'Talleres AutoFix',
  taxId: 'B12345678',
  address: 'Calle Falsa 123',
}

describe('SqliteUserRepository', () => {
  let repo: SqliteUserRepository

  beforeAll(() => {
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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

    repo = new SqliteUserRepository(drizzle(sqlite))
  })

  describe('create', () => {
    it('crea un usuario individual y lo devuelve con ID', async () => {
      const user = await repo.create(mockUser)

      expect(user.id).toBeDefined()
      expect(user.id).toBeGreaterThan(0)
      expect(user.username).toBe('testuser')
      expect(user.email).toBe('test@example.com')
      expect(user.passwordHash).toBe(mockUser.passwordHash)
      expect(user.userType).toBe('individual')
      expect(user.businessName).toBeNull()
      expect(user.taxId).toBeNull()
      expect(user.address).toBeNull()
      expect(user.createdAt).toBeDefined()
    })

    it('crea un taller con campos de negocio', async () => {
      const user = await repo.create(mockWorkshop)

      expect(user.userType).toBe('workshop')
      expect(user.businessName).toBe('Talleres AutoFix')
      expect(user.taxId).toBe('B12345678')
      expect(user.address).toBe('Calle Falsa 123')
    })

    it('normaliza el email a minusculas', async () => {
      const user = await repo.create({
        ...mockUser,
        username: 'mixedcase',
        email: 'MiXeD@Example.COM',
      })

      expect(user.email).toBe('mixed@example.com')
    })

    it('rechaza email duplicado', async () => {
      await repo.create({ ...mockUser, username: 'unique1', email: 'dup@example.com' })

      await expect(
        repo.create({ ...mockUser, username: 'unique2', email: 'dup@example.com' }),
      ).rejects.toThrow()
    })

    it('rechaza username duplicado', async () => {
      await repo.create({ ...mockUser, username: 'dupuser', email: 'a@example.com' })

      await expect(
        repo.create({ ...mockUser, username: 'dupuser', email: 'b@example.com' }),
      ).rejects.toThrow()
    })
  })

  describe('findByEmail', () => {
    it('devuelve null si el email no existe', async () => {
      const user = await repo.findByEmail('noexiste@example.com')

      expect(user).toBeNull()
    })

    it('encuentra un usuario por email (case-insensitive)', async () => {
      await repo.create({ ...mockUser, username: 'findme', email: 'FindMe@Example.COM' })

      const user = await repo.findByEmail('findme@example.com')

      expect(user).not.toBeNull()
      expect(user!.username).toBe('findme')
      expect(user!.passwordHash).toBe(mockUser.passwordHash)
    })
  })

  describe('findById', () => {
    it('devuelve null si el ID no existe', async () => {
      const user = await repo.findById(99999)

      expect(user).toBeNull()
    })

    it('encuentra un usuario por ID', async () => {
      const created = await repo.create({
        ...mockUser,
        username: 'byid',
        email: 'byid@example.com',
      })

      const user = await repo.findById(created.id!)

      expect(user).not.toBeNull()
      expect(user!.username).toBe('byid')
      expect(user!.email).toBe('byid@example.com')
    })
  })
})
