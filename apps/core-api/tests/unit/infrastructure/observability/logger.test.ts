import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { desc } from 'drizzle-orm'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { Logger } from '@/infrastructure/observability/logger.js'

describe('Logger', () => {
  let db: ReturnType<typeof drizzle>
  let logger: Logger

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)
    db = drizzle(sqlite)
    logger = new Logger('test', db)
  })

  function findLatestLog() {
    return db.select().from(schema.logs).orderBy(desc(schema.logs.id)).limit(1).all()[0]
  }

  it('should persist an info log to the logs table', () => {
    logger.info('server started')

    const log = findLatestLog()
    expect(log.level).toBe('info')
    expect(log.message).toBe('server started')
    expect(log.context).toBeNull()
  })

  it('should persist a warn log to the logs table', () => {
    logger.warn('rate limit approaching')

    const log = findLatestLog()
    expect(log.level).toBe('warn')
    expect(log.message).toBe('rate limit approaching')
  })

  it('should persist an error log to the logs table', () => {
    logger.error('connection failed')

    const log = findLatestLog()
    expect(log.level).toBe('error')
    expect(log.message).toBe('connection failed')
  })

  it('should persist a debug log with context', () => {
    logger.debug('diagnosis started', { scenarioId: 'audi-a3-idle', rpm: 750 })

    const log = findLatestLog()
    expect(log.level).toBe('debug')
    expect(log.message).toBe('diagnosis started')
    expect(log.context).toBe('{"scenarioId":"audi-a3-idle","rpm":750}')
  })

  it('should persist multiple logs incrementally', () => {
    logger.info('first')
    logger.info('second')
    logger.info('third')

    const logs = db.select().from(schema.logs).all()
    const infos = logs.filter(
      (l) => l.message === 'first' || l.message === 'second' || l.message === 'third',
    )
    expect(infos).toHaveLength(3)
  })

  it('should not throw when DB insert fails', () => {
    const mockDb = {
      insert: () => ({
        values: () => ({
          execute: () => Promise.reject(new Error('DB down')),
        }),
      }),
    } as unknown as ReturnType<typeof drizzle>

    const silentLogger = new Logger('test', mockDb)
    expect(() => silentLogger.error('should not explode')).not.toThrow()
  })
})
