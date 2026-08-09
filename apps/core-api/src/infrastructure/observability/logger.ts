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

  /**
   * Convierte valores `Error` del contexto en objetos serializables con `message`,
   * `stack` y `name`. `JSON.stringify` ignora propiedades no enumerables de `Error`
   * (como `.stack` en V8); sin este paso el contexto de error se guarda como `{}`.
   */
  private serializeContext(context: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(context)) {
      if (value instanceof Error) {
        result[key] = { message: value.message, stack: value.stack, name: value.name }
      } else {
        result[key] = value
      }
    }
    return result
  }

  /**
   * `createdAt` se fija aqui explicitamente, no se deja al `default` de `schema.ts`: ese
   * default es la cadena literal `"datetime('now')"`, no una expresion SQL — omitir el
   * campo dejaria ese texto literal en vez de una fecha real, y el panel de administracion
   * (`GET /api/admin/logs`) filtra y ordena por esta columna.
   */
  private saveToDb(level: string, message: string, context?: Record<string, unknown>): void {
    const safeContext = context ? this.serializeContext(context) : undefined
    this.db
      .insert(schema.logs)
      .values({
        level,
        message,
        context: safeContext ? JSON.stringify(safeContext) : null,
        createdAt: new Date().toISOString(),
      })
      .execute()
      .catch(() => {})
  }
}
