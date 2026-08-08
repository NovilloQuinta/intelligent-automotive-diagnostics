import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'
import { adminAuditFilterSchema } from '@/application/dto/admin/AdminAuditFilter.js'

const mockLog: CreateAuditLogInput = {
  method: 'GET',
  path: '/api/scenarios',
  statusCode: 200,
  ip: '127.0.0.1',
  userAgent: 'vitest',
  durationMs: 15,
}

const mockErrorLog: CreateAuditLogInput = {
  method: 'POST',
  path: '/api/unknown',
  statusCode: 404,
  ip: '10.0.0.1',
}

describe('SqliteAuditLogRepository', () => {
  let repo: SqliteAuditLogRepository

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        duration_ms INTEGER,
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    repo = new SqliteAuditLogRepository(drizzle(sqlite))
  })

  describe('create', () => {
    it('should insert an audit log entry without throwing', async () => {
      await expect(repo.create(mockLog)).resolves.toBeUndefined()
    })

    it('should insert an audit log with minimal fields', async () => {
      await expect(repo.create(mockErrorLog)).resolves.toBeUndefined()
    })
  })
})

describe('SqliteAuditLogRepository — list/stats', () => {
  let repo: SqliteAuditLogRepository

  beforeAll(async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        duration_ms INTEGER,
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    repo = new SqliteAuditLogRepository(drizzle(sqlite))

    await repo.create({ method: 'GET', path: '/api/diagnosis', statusCode: 200, userId: 1 })
    await repo.create({ method: 'GET', path: '/api/diagnosis', statusCode: 500, userId: 1 })
    await repo.create({ method: 'POST', path: '/api/auth/login', statusCode: 401, userId: 2 })
    await repo.create({ method: 'GET', path: '/api/diagnosis', statusCode: 200, userId: 2 })
  })

  describe('list', () => {
    it('should order by createdAt descending and return the total', async () => {
      const result = await repo.list(adminAuditFilterSchema.parse({}))

      expect(result.total).toBe(4)
      expect(result.items).toHaveLength(4)
    })

    it('should filter by statusCode and path together', async () => {
      const result = await repo.list(
        adminAuditFilterSchema.parse({ statusCode: 200, path: '/api/diagnosis' }),
      )

      expect(result.total).toBe(2)
      expect(result.items.every((i) => i.statusCode === 200 && i.path === '/api/diagnosis')).toBe(
        true,
      )
    })

    it('should filter by userId', async () => {
      const result = await repo.list(adminAuditFilterSchema.parse({ userId: 2 }))

      expect(result.total).toBe(2)
    })

    it('should paginate with page/pageSize', async () => {
      const result = await repo.list(adminAuditFilterSchema.parse({ page: 1, pageSize: 2 }))

      expect(result.items).toHaveLength(2)
      expect(result.total).toBe(4)
    })
  })

  describe('stats', () => {
    it('should aggregate by status code and by path without exposing individual rows', async () => {
      const stats = await repo.stats({})

      expect(stats.byStatusCode).toEqual({ '200': 2, '500': 1, '401': 1 })
      expect(stats.byPath).toEqual({ '/api/diagnosis': 3, '/api/auth/login': 1 })
      expect(stats).not.toHaveProperty('items')
    })

    it('should restrict aggregation to the given date range', async () => {
      const farFuture = { from: '2999-01-01T00:00:00.000Z' }

      const stats = await repo.stats(farFuture)

      expect(stats.byStatusCode).toEqual({})
      expect(stats.byPath).toEqual({})
    })
  })
})
