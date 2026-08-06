import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import type { CreateAuditLogInput } from '@/application/dto/audit/CreateAuditLogInput.js'

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
