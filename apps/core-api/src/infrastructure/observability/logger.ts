import pino from 'pino'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/** Logger estructurado con pino que persiste en la tabla logs de SQLite. */
export class Logger implements LoggerPort {
  private readonly pino: pino.Logger

  constructor(
    level: string,
    private readonly db: DiagnosticsDb,
  ) {
    this.pino = pino({
      level: level === 'development' || level === 'test' ? 'debug' : 'info',
      transport:
        level === 'development'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
    })
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.pino.debug(context ?? {}, message)
    this.saveToDb('debug', message, context)
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.pino.info(context ?? {}, message)
    this.saveToDb('info', message, context)
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.pino.warn(context ?? {}, message)
    this.saveToDb('warn', message, context)
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.pino.error(context ?? {}, message)
    this.saveToDb('error', message, context)
  }

  private saveToDb(level: string, message: string, context?: Record<string, unknown>): void {
    this.db
      .insert(schema.logs)
      .values({
        level,
        message,
        context: context ? JSON.stringify(context) : null,
      })
      .execute()
      .catch(() => {})
  }
}
