import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { Email } from '@/domain/value-objects/email.js'

const mockUser: CreateUserInput = {
  username: 'testuser',
  email: new Email('test@example.com'),
  passwordHash: '$2b$12$hashedpasswordvaluehere',
  userType: 'individual',
}

const mockWorkshop: CreateUserInput = {
  username: 'tallercars',
  email: new Email('taller@example.com'),
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

    repo = new SqliteUserRepository(drizzle(sqlite))
  })

  describe('create', () => {
    it('crea un usuario individual y lo devuelve con ID', async () => {
      const user = await repo.create(mockUser)

      expect(user.id).toBeDefined()
      expect(user.id).toBeGreaterThan(0)
      expect(user.username).toBe('testuser')
      expect(user.email.value).toBe('test@example.com')
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
        email: new Email('MiXeD@Example.COM'),
      })

      expect(user.email.value).toBe('mixed@example.com')
    })

    it('rechaza email duplicado', async () => {
      await repo.create({ ...mockUser, username: 'unique1', email: new Email('dup@example.com') })

      await expect(
        repo.create({ ...mockUser, username: 'unique2', email: new Email('dup@example.com') }),
      ).rejects.toThrow()
    })

    it('rechaza username duplicado', async () => {
      await repo.create({ ...mockUser, username: 'dupuser', email: new Email('a@example.com') })

      await expect(
        repo.create({ ...mockUser, username: 'dupuser', email: new Email('b@example.com') }),
      ).rejects.toThrow()
    })
  })

  describe('findByEmail', () => {
    it('devuelve null si el email no existe', async () => {
      const user = await repo.findByEmail('noexiste@example.com')

      expect(user).toBeNull()
    })

    it('encuentra un usuario por email (case-insensitive)', async () => {
      await repo.create({ ...mockUser, username: 'findme', email: new Email('FindMe@Example.COM') })

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
        email: new Email('byid@example.com'),
      })

      const user = await repo.findById(created.id!)

      expect(user).not.toBeNull()
      expect(user!.username).toBe('byid')
      expect(user!.email.value).toBe('byid@example.com')
    })
  })
  describe('incrementFailedLogin concurrency', () => {
    it('should count every concurrent attempt, not just the last write', async () => {
      const user = await repo.create({
        username: 'raceuser',
        email: new Email('race@example.com'),
        passwordHash: '$2b$12$hashedpasswordvaluehere',
        userType: 'individual',
      })

      // Leer-modificar-escribir en dos sentencias permite que N intentos
      // simultaneos lean el mismo contador y escriban todos el mismo +1,
      // esquivando el bloqueo a los 5 intentos.
      await Promise.all(Array.from({ length: 5 }, () => repo.incrementFailedLogin(user.id)))

      const after = await repo.findById(user.id)
      expect(after?.failedLoginAttempts).toBe(5)
    })

    it('should lock the account once the threshold is reached concurrently', async () => {
      const user = await repo.create({
        username: 'lockuser',
        email: new Email('lock@example.com'),
        passwordHash: '$2b$12$hashedpasswordvaluehere',
        userType: 'individual',
      })

      await Promise.all(Array.from({ length: 5 }, () => repo.incrementFailedLogin(user.id)))

      const after = await repo.findById(user.id)
      expect(after?.lockedUntil).not.toBeNull()
    })
  })
})
