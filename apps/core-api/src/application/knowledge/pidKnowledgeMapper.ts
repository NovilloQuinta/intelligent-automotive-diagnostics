import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import { toValidatableMetadata, toValidatableEntry } from './validatableEntryMapper.js'

/** Convierte un PID aprendido en los metadatos que se guardan junto al vector. */
export function toPidMetadata(entry: PidKnowledgeEntry): Record<string, MetadataValue> {
  return toValidatableMetadata(entry)
}

/** Reconstruye el PID aprendido a partir de sus metadatos. */
export function toPidEntry(metadata: Readonly<Record<string, unknown>>): PidKnowledgeEntry {
  return toValidatableEntry(metadata)
}
