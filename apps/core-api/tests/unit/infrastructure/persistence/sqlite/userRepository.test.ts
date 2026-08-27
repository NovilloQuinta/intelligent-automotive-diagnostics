import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql } from 'drizzle-orm'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { Email } from '@/domain/value-objects/Email.js'
import { adminUsersFilterSchema } from '@/application/dto/admin/AdminUsersFilter.js'

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
    resetDb()
    repo = new SqliteUserRepository(getDb())
  })

  afterAll(() => {
    resetDb()
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

  describe('updatePassword', () => {
    it('actualiza el passwordHash del usuario', async () => {
      const created = await repo.create({
        ...mockUser,
        username: 'pwduser',
        email: new Email('pwduser@example.com'),
      })

      await repo.updatePassword(created.id, '$2b$12$newhashvalue')

      const updated = await repo.findById(created.id)
      expect(updated!.passwordHash).toBe('$2b$12$newhashvalue')
    })
  })

  describe('updateProfile', () => {
    it('actualiza parcialmente username/address/businessName/taxId', async () => {
      const created = await repo.create({
        ...mockUser,
        username: 'profileuser',
        email: new Email('profileuser@example.com'),
      })

      const updated = await repo.updateProfile(created.id, {
        username: 'renameduser',
        address: 'Nueva direccion 42',
      })

      expect(updated.username).toBe('renameduser')
      expect(updated.address).toBe('Nueva direccion 42')
      expect(updated.email.value).toBe('profileuser@example.com')
    })

    it('deja intactos los campos no incluidos en el patch', async () => {
      const created = await repo.create({
        ...mockWorkshop,
        username: 'tallerprofile',
        email: new Email('tallerprofile@example.com'),
      })

      const updated = await repo.updateProfile(created.id, { address: 'Otra calle 1' })

      expect(updated.businessName).toBe('Talleres AutoFix')
      expect(updated.taxId).toBe('B12345678')
      expect(updated.address).toBe('Otra calle 1')
    })
  })

  describe('existsByUsername', () => {
    it('devuelve false si el username no existe', async () => {
      const exists = await repo.existsByUsername('nadieusaesto')
      expect(exists).toBe(false)
    })

    it('devuelve true si el username existe', async () => {
      await repo.create({
        ...mockUser,
        username: 'existente',
        email: new Email('existente@example.com'),
      })

      const exists = await repo.existsByUsername('existente')
      expect(exists).toBe(true)
    })

    it('excluye el propio userId al comprobar unicidad', async () => {
      const created = await repo.create({
        ...mockUser,
        username: 'propio',
        email: new Email('propio@example.com'),
      })

      const exists = await repo.existsByUsername('propio', created.id)
      expect(exists).toBe(false)
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

describe('SqliteUserRepository — list/stats', () => {
  let repo: SqliteUserRepository

  beforeAll(async () => {
    resetDb()
    repo = new SqliteUserRepository(getDb())

    await repo.create({
      username: 'juan',
      email: new Email('juan@example.com'),
      passwordHash: '$2b$12$hash1',
      userType: 'individual',
    })
    await repo.create({
      username: 'tallerfix',
      email: new Email('taller@example.com'),
      passwordHash: '$2b$12$hash2',
      userType: 'workshop',
    })
    await repo.create({
      username: 'admin',
      email: new Email('admin@example.com'),
      passwordHash: '$2b$12$hash3',
      userType: 'individual',
      role: 'admin',
    })
  })

  describe('list', () => {
    it('should never include passwordHash', async () => {
      const result = await repo.list(adminUsersFilterSchema.parse({}))

      expect(result.total).toBe(3)
      for (const item of result.items) {
        expect(item).not.toHaveProperty('passwordHash')
      }
    })

    it('should filter by q over email/username', async () => {
      const result = await repo.list(adminUsersFilterSchema.parse({ q: 'taller' }))

      expect(result.total).toBe(1)
      expect(result.items[0]?.username).toBe('tallerfix')
    })

    it('should paginate with page/pageSize', async () => {
      const result = await repo.list(adminUsersFilterSchema.parse({ page: 1, pageSize: 2 }))

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(3)
    })
  })

  describe('stats', () => {
    it('should aggregate totals by userType and by role', async () => {
      const stats = await repo.stats()

      expect(stats.byUserType).toEqual({ individual: 2, workshop: 1 })
      expect(stats.byRole).toEqual({ user: 2, admin: 1 })
    })
  })
})

describe('SqliteUserRepository — caducidad del bloqueo', () => {
  let repo: SqliteUserRepository
  let db: DiagnosticsDb

  beforeAll(() => {
    resetDb()
    db = getDb()
    repo = new SqliteUserRepository(db)
  })

  afterAll(() => {
    resetDb()
  })

  /** Deja al usuario bloqueado y adelanta el reloj poniendo el bloqueo en el pasado. */
  async function lockAndExpire(userId: number): Promise<void> {
    for (let i = 0; i < 5; i += 1) await repo.incrementFailedLogin(userId)
    db.run(
      sql`UPDATE users SET locked_until = ${new Date(Date.now() - 60_000).toISOString()} WHERE id = ${userId}`,
    )
  }

  it('deberia reiniciar el contador cuando el bloqueo anterior ya expiro', async () => {
    const user = await repo.create({
      username: 'expireduser',
      email: new Email('expired@example.com'),
      passwordHash: '$2b$12$hashedpasswordvaluehere',
      userType: 'individual',
    })
    await lockAndExpire(user.id)

    await repo.incrementFailedLogin(user.id)

    // Con el contador pegado a 5, un unico fallo tras la expiracion volvia a
    // bloquear 15 minutos: el usuario perdia los 4 intentos que le tocaban.
    const after = await repo.findById(user.id)
    expect(after?.failedLoginAttempts).toBe(1)
    expect(after?.lockedUntil).toBeNull()
  })

  it('deberia volver a bloquear tras 5 fallos nuevos posteriores a la expiracion', async () => {
    const user = await repo.create({
      username: 'relockuser',
      email: new Email('relock@example.com'),
      passwordHash: '$2b$12$hashedpasswordvaluehere',
      userType: 'individual',
    })
    await lockAndExpire(user.id)

    for (let i = 0; i < 5; i += 1) await repo.incrementFailedLogin(user.id)

    const after = await repo.findById(user.id)
    expect(after?.failedLoginAttempts).toBe(5)
    expect(after?.lockedUntil).not.toBeNull()
    expect(new Date(after!.lockedUntil!).getTime()).toBeGreaterThan(Date.now())
  })

  it('no deberia prolongar un bloqueo todavia vigente', async () => {
    const user = await repo.create({
      username: 'activelock',
      email: new Email('activelock@example.com'),
      passwordHash: '$2b$12$hashedpasswordvaluehere',
      userType: 'individual',
    })
    for (let i = 0; i < 5; i += 1) await repo.incrementFailedLogin(user.id)
    // Bloqueo vigente pero a punto de expirar: si el intento lo reescribiera,
    // se veria saltar de nuevo a los 15 minutos.
    const expiresSoon = new Date(Date.now() + 2000).toISOString()
    db.run(sql`UPDATE users SET locked_until = ${expiresSoon} WHERE id = ${user.id}`)

    const state = await repo.incrementFailedLogin(user.id)

    expect(state.failedLoginAttempts).toBe(6)
    expect(state.lockedUntil).toBe(expiresSoon)
  })
})
