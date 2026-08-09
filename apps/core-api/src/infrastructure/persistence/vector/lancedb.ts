import { connect } from '@lancedb/lancedb'
import type { Connection } from '@lancedb/lancedb'
import type { Table } from '@lancedb/lancedb'
import { Bool, Field, FixedSizeList, Float32, Float64, Int32, Int64, Int8, Int16, Schema, Utf8 } from 'apache-arrow'
import type { DataType } from 'apache-arrow'
import { z } from 'zod'

const SUPPORTED_COLUMN_TYPES = ['string', 'float32', 'int32', 'boolean'] as const

const columnSchema = z.object({
  name: z.string().min(1),
  type: z.enum(SUPPORTED_COLUMN_TYPES),
})

const columnsSchema = z.array(columnSchema).min(1)

/** Definicion de columna con nombre y tipo de dato soportado. */
export type ColumnDefinition = z.infer<typeof columnSchema>

/**
 * LanceDB tambien acepta el tipo como cadena, pero lo resuelve contra un diccionario que
 * solo conoce `utf8` y `bool`: pasarle `'string'` o `'boolean'` revienta con
 * `Unrecognized type name in schema`. Construir la clase Arrow evita esa traduccion.
 */
const ARROW_TYPE_BY_NAME: Record<ColumnDefinition['type'], () => DataType> = {
  string: () => new Utf8(),
  float32: () => new Float32(),
  int32: () => new Int32(),
  boolean: () => new Bool(),
}

function toArrowField(column: ColumnDefinition): Field {
  return new Field(column.name, ARROW_TYPE_BY_NAME[column.type](), true)
}

/** Columna que almacena el embedding. */
export const VECTOR_COLUMN = 'vector'

const vectorTableOptionsSchema = z.object({
  dimensions: z.number().int().positive(),
  columns: columnsSchema,
})

/** Dimensiones del embedding y columnas de metadatos de una tabla vectorial. */
export type VectorTableOptions = z.infer<typeof vectorTableOptionsSchema>

/** Operaciones de esquema que necesita `ensureVectorTable`. */
export type LanceDbSchemaOps = Pick<
  Connection,
  'tableNames' | 'createEmptyTable' | 'openTable' | 'dropTable'
>

/** Conexion a una base de datos LanceDB con nombres de tabla en cache. */
export interface LanceDbConnection {
  db: Connection
  tableNames: string[]
}

/**
 * LanceDB 0.31 no valida la dimension: un vector corto se rellena con `null` y uno largo se
 * trunca, sin error. Un vector con `null` produce similitudes basura, asi que hay que
 * comprobarlo antes de insertar.
 */
export function assertVectorDimensions(vector: readonly number[], dimensions: number): void {
  if (vector.length !== dimensions) {
    throw new Error(
      `Dimension del vector incorrecta: se esperaban ${dimensions} y se recibieron ${vector.length}. ` +
        'LanceDB no rechaza este caso — rellena con null o trunca en silencio.',
    )
  }
}

/**
 * Valor por defecto para una columna nueva durante la migracion de schema.
 *
 * LanceDB no soporta `ALTER COLUMN`. La unica migracion viable es leer todas
 * las filas de la tabla vieja, anadir las columnas nuevas con su valor por
 * defecto, crear una tabla nueva con el schema actualizado e insertar todo.
 * Los vectores no se recalculan: ya estan almacenados.
 */
function defaultValueForField(field: Field): unknown {
  const type = field.type
  if (type instanceof Float32 || type instanceof Float64) return 0.0
  if (type instanceof Int8 || type instanceof Int16 || type instanceof Int32 || type instanceof Int64) return 0
  if (type instanceof Utf8) return ''
  if (type instanceof Bool) return false
  if (type instanceof FixedSizeList) return []
  return null
}

/**
 * Migra los datos de una tabla con schema antiguo a una nueva con el schema
 * esperado. Lee todas las filas, anade valores por defecto en las columnas
 * nuevas, crea la tabla destino e inserta todo de una vez.
 *
 * Los vectores de embedding se conservan tal cual: no se recalculan.
 */
async function migrateTable(
  db: LanceDbSchemaOps,
  name: string,
  oldTable: Table,
  oldFields: Set<string>,
  expectedSchema: Schema,
): Promise<Table> {
  const newFields = expectedSchema.fields.map((f) => f.name)
  const addedColumns = newFields.filter((f) => !oldFields.has(f))
  const removedColumns = [...oldFields].filter((f) => !newFields.includes(f))

  console.warn(
    `[lancedb] Migrating '${name}': +[${addedColumns.join(', ') || 'none'}] ` +
      `-[${removedColumns.join(', ') || 'none'}]. Reading existing rows...`,
  )

  const oldRows = (await oldTable.query().toArray()) as Record<string, unknown>[]
  console.warn(`[lancedb] Read ${oldRows.length} rows from '${name}'.`)

  const migratedRows = oldRows.map((row) => {
    const newRow: Record<string, unknown> = {}
    for (const field of expectedSchema.fields) {
      const colName = field.name
      if (colName in row) {
        newRow[colName] = row[colName]
      } else {
        newRow[colName] = defaultValueForField(field)
      }
    }
    return newRow
  })

  await db.dropTable(name)
  const newTable = await db.createEmptyTable(name, expectedSchema)

  if (migratedRows.length > 0) {
    await newTable.add(migratedRows)
  }

  console.warn(`[lancedb] Migration complete: ${migratedRows.length} rows preserved.`)
  return newTable
}

/**
 * Abre la tabla si existe o la crea. Garantiza idempotencia.
 *
 * Si la tabla ya existe pero su schema no coincide con las columnas esperadas
 * (ej. falta la columna `confidence` anadida en una migracion), migra los
 * datos existentes a la tabla nueva sin perderlos. LanceDB no soporta
 * `ALTER COLUMN`: la unica migracion viable es leer, dropear, recrear e
 * insertar todo.
 */
async function openOrCreate(
  db: LanceDbSchemaOps,
  name: string,
  buildSchema: () => Schema,
): Promise<Table> {
  const existingTables = await db.tableNames()
  if (!existingTables.includes(name)) {
    return db.createEmptyTable(name, buildSchema())
  }

  const table = await db.openTable(name)
  const actualSchema = await table.schema()
  const expectedSchema = buildSchema()

  const actualFields = new Set(actualSchema.fields.map((f) => f.name))
  const expectedFields = expectedSchema.fields.map((f) => f.name)
  const missing = expectedFields.filter((f) => !actualFields.has(f))
  const extra = [...actualFields].filter((f) => !expectedFields.includes(f))

  if (missing.length > 0 || extra.length > 0) {
    return migrateTable(db, name, table, actualFields, expectedSchema)
  }

  return table
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
 * Asegura una tabla con columna `vector` de tipo `FixedSizeList(dimensions, Float32)`, que
 * es sobre la que LanceDB resuelve la busqueda por similitud.
 *
 * Sin indice: LanceDB resuelve por busqueda exacta, correcta y de sobra rapida para el
 * corpus previsto. Si algun dia hace falta un IVF-PQ, se anade con el volumen delante.
 */
export async function ensureVectorTable(
  db: LanceDbSchemaOps,
  name: string,
  options: VectorTableOptions,
): Promise<Table> {
  const { dimensions, columns } = vectorTableOptionsSchema.parse(options)

  return openOrCreate(db, name, () => {
    const vectorField = new Field(
      VECTOR_COLUMN,
      new FixedSizeList(dimensions, new Field('item', new Float32(), true)),
      false,
    )
    return new Schema([vectorField, ...columns.map(toArrowField)])
  })
}
