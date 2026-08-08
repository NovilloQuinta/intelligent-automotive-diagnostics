import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { SqliteLogRepository } from '@/infrastructure/persistence/sqlite/logRepository.js'
import { adminLogsFilterSchema } from '@/application/dto/admin/AdminLogsFilter.js'

function insertLog(
  sqlite: InstanceType<typeof Database>,
  level: string,
  message: string,
  createdAt: string,
) {
  sqlite
    .prepare(`INSERT INTO logs (level, message, context, created_at) VALUES (?, ?, NULL, ?)`)
    .run(level, message, createdAt)
}

describe('SqliteLogRepository', () => {
  let repo: SqliteLogRepository

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    insertLog(sqlite, 'info', 'server started', '2024-01-01T00:00:00.000Z')
    insertLog(sqlite, 'error', 'connection failed', '2024-01-02T00:00:00.000Z')
    insertLog(sqlite, 'error', 'timeout', '2024-01-03T00:00:00.000Z')
    insertLog(sqlite, 'debug', 'diagnostic detail', '2024-01-04T00:00:00.000Z')

    repo = new SqliteLogRepository(drizzle(sqlite))
  })

  describe('list', () => {
    it('should order by createdAt descending and return the total', async () => {
      const result = await repo.list(adminLogsFilterSchema.parse({}))

      expect(result.total).toBe(4)
      expect(result.items.map((i) => i.message)).toEqual([
        'diagnostic detail',
        'timeout',
        'connection failed',
        'server started',
      ])
    })

    it('should filter by level', async () => {
      const result = await repo.list(adminLogsFilterSchema.parse({ level: 'error' }))

      expect(result.total).toBe(2)
      expect(result.items.every((i) => i.level === 'error')).toBe(true)
    })

    it('should filter by date range', async () => {
      const result = await repo.list(
        adminLogsFilterSchema.parse({
          from: '2024-01-02T00:00:00.000Z',
          to: '2024-01-03T00:00:00.000Z',
        }),
      )

      expect(result.total).toBe(2)
    })

    it('should filter by free-text search over the message', async () => {
      const result = await repo.list(adminLogsFilterSchema.parse({ q: 'connection' }))

      expect(result.total).toBe(1)
      expect(result.items[0]?.message).toBe('connection failed')
    })

    it('should paginate with page/pageSize', async () => {
      const firstPage = await repo.list(adminLogsFilterSchema.parse({ page: 1, pageSize: 2 }))
      const secondPage = await repo.list(adminLogsFilterSchema.parse({ page: 2, pageSize: 2 }))

      expect(firstPage.items).toHaveLength(2)
      expect(secondPage.items).toHaveLength(2)
      expect(firstPage.total).toBe(4)
      expect(secondPage.total).toBe(4)
      expect(firstPage.items[0]?.message).not.toBe(secondPage.items[0]?.message)
    })
  })
})
