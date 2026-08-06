import type { LanceVectorStoreConfig } from './lanceVectorStore.js'

/** Dimensiones del modelo `paraphrase-multilingual-MiniLM-L12-v2`. */
export const EMBEDDING_DIMENSIONS = 384

/**
 * Esquema de las tablas del catalogo (ADR-007 §3).
 *
 * Las columnas deben cubrir las claves que produce cada `toMetadata`. Ese contrato entre
 * capas lo verifican los tests de integracion.
 */
export const PIDS_TABLE_CONFIG: LanceVectorStoreConfig = {
  table: 'pids_index',
  dimensions: EMBEDDING_DIMENSIONS,
  columns: [
    { name: 'id', type: 'string' },
    { name: 'embeddedText', type: 'string' },
    { name: 'manufacturer', type: 'string' },
    { name: 'model', type: 'string' },
    { name: 'confidence', type: 'float32' },
    { name: 'source', type: 'string' },
    { name: 'obdValidated', type: 'boolean' },
  ],
}

/** Tabla de codigos DTC especificos de fabricante. */
export const DTCS_TABLE_CONFIG: LanceVectorStoreConfig = {
  table: 'dtcs_index',
  dimensions: EMBEDDING_DIMENSIONS,
  columns: [
    { name: 'id', type: 'string' },
    { name: 'embeddedText', type: 'string' },
    { name: 'manufacturer', type: 'string' },
    { name: 'model', type: 'string' },
    { name: 'confidence', type: 'float32' },
    { name: 'source', type: 'string' },
  ],
}

/** Memoria de taller. Las listas se guardan serializadas. */
export const DIAGNOSES_TABLE_CONFIG: LanceVectorStoreConfig = {
  table: 'diagnoses_index',
  dimensions: EMBEDDING_DIMENSIONS,
  columns: [
    { name: 'id', type: 'string' },
    { name: 'embeddedText', type: 'string' },
    { name: 'manufacturer', type: 'string' },
    { name: 'model', type: 'string' },
    { name: 'symptoms', type: 'string' },
    { name: 'pidsInvolved', type: 'string' },
  ],
}
