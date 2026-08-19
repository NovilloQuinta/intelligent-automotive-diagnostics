import type { VectorMatch } from '@/application/dto/vector/VectorMatch.js'
import type { VectorQuery } from '@/application/dto/vector/VectorQuery.js'
import type { VectorRecord } from '@/application/dto/vector/VectorRecord.js'

/**
 * Almacen vectorial. Es la unica pieza a reimplementar para cambiar de motor: todo lo que
 * hay por encima depende de esta interfaz y no del backend.
 */
export interface VectorStorePort {
  upsert(records: readonly VectorRecord[]): Promise<void>

  /** Devuelve las coincidencias ordenadas de menor a mayor distancia. */
  query(query: VectorQuery): Promise<VectorMatch[]>

  /** Numero de filas de la tabla. Para visibilidad del catalogo, no para el flujo RAG. */
  count(): Promise<number>

  /**
   * Devuelve hasta `limit` filas de metadatos, sin orden por relevancia y sin generar
   * ningun embedding: es "dame unas cuantas para ver que hay", no una busqueda semantica.
   */
  sample(limit: number): Promise<Readonly<Record<string, unknown>>[]>
}
