import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'

/** Tipo de base de datos de diagnóstico. Cambiar aquí al migrar de motor SQL. */
export type DiagnosticsDb = BetterSQLite3Database<typeof schema>

let _db: DiagnosticsDb | null = null
let _sqlite: InstanceType<typeof Database> | null = null

/** Inicializa (o devuelve la instancia existente) de la BD SQLite con Drizzle. */
export function getDb(dbPath?: string): DiagnosticsDb {
  if (!_db) {
    _sqlite = new Database(dbPath ?? ':memory:')
    _sqlite.pragma('journal_mode = WAL')
    _sqlite.pragma('foreign_keys = ON')
    _db = drizzle(_sqlite, { schema })
  }
  return _db
}

/** Cierra la conexión a BD y resetea la instancia (útil en tests). */
export function closeDb(): void {
  if (_sqlite) {
    _sqlite.close()
    _sqlite = null
  }
  _db = null
}

/** Reinicia la instancia de BD para tests (cierra y permite re-abrir con otra ruta). */
export function resetDb(): void {
  _db = null
}
