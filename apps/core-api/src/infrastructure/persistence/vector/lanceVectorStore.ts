import type { VehicleScope } from '@/application/dto/vector/VehicleScope.js'
import type { VectorMatch } from '@/application/dto/vector/VectorMatch.js'
import type { VectorQuery } from '@/application/dto/vector/VectorQuery.js'
import type { VectorRecord } from '@/application/dto/vector/VectorRecord.js'
import type { VectorStorePort } from '@/application/ports/VectorStorePort.js'
import {
  assertVectorDimensions,
  ensureVectorTable,
  VECTOR_COLUMN,
  type ColumnDefinition,
  type LanceDbSchemaOps,
} from './lancedb.js'

/** Tabla LanceDB que respalda un almacen vectorial. */
export interface LanceVectorStoreConfig {
  readonly table: string
  readonly dimensions: number
  readonly columns: readonly ColumnDefinition[]
}

/** Columna que LanceDB anade con la distancia al vector de consulta. */
const DISTANCE_COLUMN = '_distance'

/** Los predicados son cadenas tipo SQL: sin escapar, un valor podria alterar la consulta. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function buildPredicate(scope: VehicleScope | undefined): string | undefined {
  if (!scope) {
    return undefined
  }

  const clauses: string[] = []
  if (scope.manufacturer) {
    clauses.push(`manufacturer = ${quote(scope.manufacturer)}`)
  }
  if (scope.model) {
    clauses.push(`model = ${quote(scope.model)}`)
  }

  return clauses.length > 0 ? clauses.join(' AND ') : undefined
}

function extractMetadata(row: Record<string, unknown>): Record<string, unknown> {
  const { [VECTOR_COLUMN]: _vector, [DISTANCE_COLUMN]: _distance, ...metadata } = row
  return metadata
}

/**
 * Almacen vectorial sobre LanceDB.
 *
 * Unico modulo atado al motor en toda la cadena de busqueda semantica: aprovisiona la tabla,
 * traduce el filtro a predicado, escapa literales y valida dimensiones. Cambiar de motor se
 * reduce a escribir otro fichero como este.
 */
export async function createLanceVectorStore(
  db: LanceDbSchemaOps,
  config: LanceVectorStoreConfig,
): Promise<VectorStorePort> {
  const table = await ensureVectorTable(db, config.table, {
    dimensions: config.dimensions,
    columns: [...config.columns],
  })

  return {
    async upsert(records: readonly VectorRecord[]): Promise<void> {
      if (records.length === 0) {
        return
      }

      const rows = records.map((record) => {
        assertVectorDimensions(record.vector, config.dimensions)
        return { [VECTOR_COLUMN]: [...record.vector], ...record.metadata }
      })

      await table.add(rows)
    },

    async query({ vector, limit, filter }: VectorQuery): Promise<VectorMatch[]> {
      assertVectorDimensions(vector, config.dimensions)

      let search = table.search([...vector]).limit(limit)

      const predicate = buildPredicate(filter)
      if (predicate !== undefined) {
        search = search.where(predicate)
      }

      const rows = (await search.toArray()) as Record<string, unknown>[]

      return rows.map((row) => ({
        metadata: extractMetadata(row),
        distance: (row[DISTANCE_COLUMN] as number | undefined) ?? Number.NaN,
      }))
    },

    async count(): Promise<number> {
      return table.countRows()
    },

    async sample(limit: number): Promise<Readonly<Record<string, unknown>>[]> {
      // `table.query()` (sin vector) es un scan plano: no genera ningun embedding, a
      // diferencia de `table.search()` que usa `query()` de este mismo store.
      const rows = (await table.query().limit(limit).toArray()) as Record<string, unknown>[]

      return rows.map(extractMetadata)
    },
  }
}
