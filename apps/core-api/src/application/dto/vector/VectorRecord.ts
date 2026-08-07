/** Solo escalares: es el minimo comun de los motores vectoriales. */
export type MetadataValue = string | number | boolean

/** Vector a guardar junto a los metadatos por los que se podra filtrar. */
export interface VectorRecord {
  readonly vector: readonly number[]
  readonly metadata: Readonly<Record<string, MetadataValue>>
}
