import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import * as schema from './schema.js'

/**
 * Tipo concreto de BD de diagnóstico.
 * Acopla a Drizzle/SQLite — límite de capa de infrastructure.
 * Cambiar aquí al migrar de motor SQL.
 */
export type DiagnosticsDb = BetterSQLite3Database<typeof schema>

const MIGRATIONS_FOLDER = path.resolve('drizzle')

let _db: DiagnosticsDb | null = null
let _sqlite: InstanceType<typeof Database> | null = null

/**
 * Devuelve la instancia singleton de BD SQLite con Drizzle.
 * En la primera llamada abre la conexión, configura WAL + foreign keys,
 * y ejecuta las migraciones pendientes desde {@link MIGRATIONS_FOLDER}.
 * Llamadas posteriores devuelven la misma instancia sin re-inicializar.
 *
 * @param dbPath - Ruta al archivo .db. Si se omite, usa `:memory:`.
 * @returns La instancia Drizzle con el schema completo aplicado.
 */
export function getDb(dbPath?: string): DiagnosticsDb {
  if (!_db) {
    _sqlite = new Database(dbPath ?? ':memory:')
    _sqlite.pragma('journal_mode = WAL')
    _sqlite.pragma('foreign_keys = ON')
    _db = drizzle(_sqlite, { schema })
    migrate(_db, { migrationsFolder: MIGRATIONS_FOLDER })
  }
  return _db
}

/** Cierra la conexión nativa a SQLite y resetea el singleton. Idempotente. */
export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
  _db = null
}

/** Alias de {@link closeDb} para resetear el singleton entre tests. */
export function resetDb(): void {
  closeDb()
}
