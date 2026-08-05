import { connect } from '@lancedb/lancedb'
import type { Connection } from '@lancedb/lancedb'
import type { Table } from '@lancedb/lancedb'
import { z } from 'zod'

const SUPPORTED_COLUMN_TYPES = ['string', 'float32', 'int32', 'boolean'] as const

const columnSchema = z.object({
  name: z.string().min(1),
  type: z.enum(SUPPORTED_COLUMN_TYPES),
})

const columnsSchema = z.array(columnSchema).min(1)

/** Definicion de columna con nombre y tipo de dato soportado. */
export type ColumnDefinition = z.infer<typeof columnSchema>

/** Conexion a una base de datos LanceDB con nombres de tabla en cache. */
export interface LanceDbConnection {
  db: Connection
  tableNames: string[]
}

/**
 * Conecta a una base de datos LanceDB embebida en la ruta indicada.
 *
 * @param dbPath - Ruta en disco al directorio de la base de datos (por defecto: `./data/lancedb`).
 * @returns La conexion a LanceDB y la lista de tablas existentes.
 */
export async function initLanceDb(dbPath?: string): Promise<LanceDbConnection> {
  const path = dbPath ?? './data/lancedb'
  const db = await connect(path)
  const tableNames = await db.tableNames()
  return { db, tableNames }
}

/**
 * Asegura que una tabla exista en la base de datos, creandola con el esquema dado si es necesario.
 * Valida los tipos de columna con Zod; solo se soportan `string`, `float32`, `int32` y `boolean`.
 *
 * @param db - La conexion a LanceDB.
 * @param name - El nombre de la tabla.
 * @param columns - Definiciones de columna (nombre + tipo).
 * @returns La tabla existente o recien creada.
 * @throws Si algun tipo de columna no esta soportado.
 */
export async function ensureTable(
  db: Pick<Connection, 'tableNames' | 'createEmptyTable' | 'openTable'>,
  name: string,
  columns: ColumnDefinition[],
): Promise<Table> {
  const validatedColumns = columnsSchema.parse(columns)

  const existingTables = await db.tableNames()
  if (existingTables.includes(name)) {
    return db.openTable(name)
  }

  const fields = validatedColumns.map((col) => ({
    type: col.type,
    name: col.name,
    nullable: true,
  }))

  const schema = {
    fields,
    metadata: new Map<string, string>(),
    names: fields.map((f) => f.name),
  }

  return db.createEmptyTable(name, schema as Parameters<typeof db.createEmptyTable>[1])
}
