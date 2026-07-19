import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import type { CreateAuditLogInput } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'

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
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    repo = new SqliteAuditLogRepository(drizzle(sqlite))
  })

  describe('create', () => {
    it('should insert an audit log entry and return it with an id', async () => {
      const entry = await repo.create(mockLog)

      expect(entry.id).toBeGreaterThan(0)
      expect(entry.method).toBe('GET')
      expect(entry.path).toBe('/api/scenarios')
      expect(entry.statusCode).toBe(200)
      expect(entry.ip).toBe('127.0.0.1')
      expect(entry.userAgent).toBe('vitest')
      expect(entry.durationMs).toBe(15)
      expect(entry.createdAt).toBeDefined()
    })

    it('should insert an audit log with minimal fields', async () => {
      const entry = await repo.create(mockErrorLog)

      expect(entry.statusCode).toBe(404)
      expect(entry.userAgent).toBeNull()
      expect(entry.durationMs).toBeNull()
    })
  })

  describe('findRecent', () => {
    it('should return recent audit logs ordered by id descending', async () => {
      await repo.create({ ...mockLog, path: '/api/first' })
      await repo.create({ ...mockLog, path: '/api/second' })

      const logs = await repo.findRecent(2)

      expect(logs).toHaveLength(2)
      expect(logs[0].path).toBe('/api/second')
      expect(logs[1].path).toBe('/api/first')
    })

    it('should respect the limit parameter', async () => {
      await repo.create({ ...mockLog, path: '/api/a' })
      await repo.create({ ...mockLog, path: '/api/b' })
      await repo.create({ ...mockLog, path: '/api/c' })

      const logs = await repo.findRecent(2)

      expect(logs).toHaveLength(2)
    })

    it('should return empty array when no logs exist', async () => {
      // New DB, no inserts yet in this describe block's scope
      const sqlite = new Database(':memory:')
      const db = drizzle(sqlite)
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          method TEXT NOT NULL,
          path TEXT NOT NULL,
          status_code INTEGER NOT NULL,
          ip TEXT,
          user_agent TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
      `)
      const emptyRepo = new SqliteAuditLogRepository(db)

      const logs = await emptyRepo.findRecent(5)

      expect(logs).toEqual([])
    })
  })
})
