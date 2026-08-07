import { connect } from '@lancedb/lancedb'
import type { Connection } from '@lancedb/lancedb'
import type { Table } from '@lancedb/lancedb'
import { Bool, Field, FixedSizeList, Float32, Int32, Schema, Utf8 } from 'apache-arrow'
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
export type LanceDbSchemaOps = Pick<Connection, 'tableNames' | 'createEmptyTable' | 'openTable'>

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

/** Abre la tabla si existe o la crea. Garantiza idempotencia. */
async function openOrCreate(
  db: LanceDbSchemaOps,
  name: string,
  buildSchema: () => Schema,
): Promise<Table> {
  const existingTables = await db.tableNames()
  if (existingTables.includes(name)) {
    return db.openTable(name)
  }

  return db.createEmptyTable(name, buildSchema())
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
