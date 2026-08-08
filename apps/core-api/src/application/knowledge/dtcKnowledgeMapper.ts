import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import { toValidatableMetadata, toValidatableEntry } from './validatableEntryMapper.js'

/** Convierte un DTC aprendido en los metadatos que se guardan junto al vector. */
export function toDtcMetadata(entry: DtcKnowledgeEntry): Record<string, MetadataValue> {
  return toValidatableMetadata(entry)
}

/** Reconstruye el DTC aprendido a partir de sus metadatos. */
export function toDtcEntry(metadata: Readonly<Record<string, unknown>>): DtcKnowledgeEntry {
  return toValidatableEntry(metadata)
}
