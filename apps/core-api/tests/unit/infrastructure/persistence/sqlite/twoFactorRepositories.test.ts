import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteTwoFactorChallengeRepository } from '@/infrastructure/persistence/sqlite/twoFactorChallengeRepository.js'
import { SqliteTwoFactorRecoveryCodeRepository } from '@/infrastructure/persistence/sqlite/twoFactorRecoveryCodeRepository.js'
import { Email } from '@/domain/value-objects/Email.js'

const HOUR_MS = 60 * 60 * 1000

const future = () => new Date(Date.now() + HOUR_MS).toISOString()
const past = () => new Date(Date.now() - HOUR_MS).toISOString()

describe('repositorios del segundo factor', () => {
  let db: DiagnosticsDb
  let users: SqliteUserRepository
  let userId: number
  let otherUserId: number

  beforeEach(async () => {
    resetDb()
    db = getDb()
    users = new SqliteUserRepository(db)
    userId = (
      await users.create({
        username: 'taller',
        email: new Email('taller@example.com'),
        passwordHash: 'hash',
        userType: 'workshop',
      })
    ).id
    otherUserId = (
      await users.create({
        username: 'otro',
        email: new Email('otro@example.com'),
        passwordHash: 'hash',
        userType: 'individual',
      })
    ).id
  })

  afterEach(() => {
    resetDb()
  })

  describe('SqliteTwoFactorChallengeRepository', () => {
    let repo: SqliteTwoFactorChallengeRepository

    beforeEach(() => {
      repo = new SqliteTwoFactorChallengeRepository(db)
    })

    it('guarda un reto y lo encuentra por su hash', async () => {
      await repo.save(userId, 'hash-del-reto', future(), false)

      const found = await repo.findByTokenHash('hash-del-reto')

      expect(found).toMatchObject({ userId, tokenHash: 'hash-del-reto', usedAt: null })
    })

    it('conserva la eleccion de sesion recordada del login', async () => {
      await repo.save(userId, 'recordado', future(), true)
      await repo.save(userId, 'normal', future(), false)

      expect((await repo.findByTokenHash('recordado'))?.rememberMe).toBe(true)
      expect((await repo.findByTokenHash('normal'))?.rememberMe).toBe(false)
    })

    it('devuelve null si el hash no existe', async () => {
      expect(await repo.findByTokenHash('no-existe')).toBeNull()
    })

    it('marca el reto como usado', async () => {
      await repo.save(userId, 'hash-del-reto', future(), false)

      await repo.markUsed('hash-del-reto')

      expect((await repo.findByTokenHash('hash-del-reto'))?.usedAt).not.toBeNull()
    })

    it('conserva la caducidad tal cual se guardo', async () => {
      const expiresAt = past()
      await repo.save(userId, 'caducado', expiresAt, false)

      expect((await repo.findByTokenHash('caducado'))?.expiresAt).toBe(expiresAt)
    })

    it('invalida los retos vivos de un usuario sin tocar los de otro', async () => {
      await repo.save(userId, 'mio', future(), false)
      await repo.save(otherUserId, 'ajeno', future(), false)

      await repo.invalidateAllForUser(userId)

      expect((await repo.findByTokenHash('mio'))?.usedAt).not.toBeNull()
      expect((await repo.findByTokenHash('ajeno'))?.usedAt).toBeNull()
    })
  })

  describe('SqliteTwoFactorRecoveryCodeRepository', () => {
    let repo: SqliteTwoFactorRecoveryCodeRepository

    beforeEach(() => {
      repo = new SqliteTwoFactorRecoveryCodeRepository(db)
    })

    it('guarda el lote completo', async () => {
      await repo.replaceAllForUser(userId, ['h1', 'h2', 'h3'])

      expect(await repo.countUnused(userId)).toBe(3)
    })

    it('canjea un codigo y lo da por bueno una vez', async () => {
      await repo.replaceAllForUser(userId, ['h1', 'h2'])

      expect(await repo.consume(userId, 'h1')).toBe(true)
    })

    it('no admite el mismo codigo dos veces', async () => {
      await repo.replaceAllForUser(userId, ['h1', 'h2'])
      await repo.consume(userId, 'h1')

      expect(await repo.consume(userId, 'h1')).toBe(false)
    })

    it('canjear uno no gasta los demas', async () => {
      await repo.replaceAllForUser(userId, ['h1', 'h2', 'h3'])

      await repo.consume(userId, 'h1')

      expect(await repo.countUnused(userId)).toBe(2)
    })

    it('rechaza un hash que no es de este usuario', async () => {
      await repo.replaceAllForUser(userId, ['h1'])
      await repo.replaceAllForUser(otherUserId, ['h9'])

      expect(await repo.consume(userId, 'h9')).toBe(false)
    })

    it('rechaza un hash inexistente', async () => {
      await repo.replaceAllForUser(userId, ['h1'])

      expect(await repo.consume(userId, 'no-existe')).toBe(false)
    })

    it('regenerar el lote descarta el anterior', async () => {
      await repo.replaceAllForUser(userId, ['viejo1', 'viejo2'])

      await repo.replaceAllForUser(userId, ['nuevo1'])

      expect(await repo.countUnused(userId)).toBe(1)
      expect(await repo.consume(userId, 'viejo1')).toBe(false)
    })

    it('borra los codigos de un usuario al desactivar el segundo factor', async () => {
      await repo.replaceAllForUser(userId, ['h1', 'h2'])
      await repo.replaceAllForUser(otherUserId, ['h9'])

      await repo.deleteAllForUser(userId)

      expect(await repo.countUnused(userId)).toBe(0)
      expect(await repo.countUnused(otherUserId)).toBe(1)
    })
  })

  describe('UserRepository — campos del segundo factor', () => {
    it('un usuario nuevo nace sin segundo factor', async () => {
      expect((await users.findById(userId))?.twoFactorEnabled).toBe(false)
    })

    it('guarda y recupera el secreto', async () => {
      await users.saveTwoFactorSecret(userId, 'secreto-cifrado')

      expect(await users.findTwoFactorSecret(userId)).toBe('secreto-cifrado')
    })

    it('guardar el secreto NO activa el segundo factor por si solo', async () => {
      await users.saveTwoFactorSecret(userId, 'secreto-cifrado')

      expect((await users.findById(userId))?.twoFactorEnabled).toBe(false)
    })

    it('activa y desactiva el flag', async () => {
      await users.saveTwoFactorSecret(userId, 'secreto-cifrado')

      await users.setTwoFactorEnabled(userId, true)
      expect((await users.findById(userId))?.twoFactorEnabled).toBe(true)

      await users.setTwoFactorEnabled(userId, false)
      expect((await users.findById(userId))?.twoFactorEnabled).toBe(false)
    })

    it('borrar el secreto lo deja en null', async () => {
      await users.saveTwoFactorSecret(userId, 'secreto-cifrado')

      await users.saveTwoFactorSecret(userId, null)

      expect(await users.findTwoFactorSecret(userId)).toBeNull()
    })

    it('devuelve null para un usuario que nunca dio de alta el segundo factor', async () => {
      expect(await users.findTwoFactorSecret(userId)).toBeNull()
    })
  })
})
