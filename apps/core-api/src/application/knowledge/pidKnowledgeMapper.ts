import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/** Convierte un PID aprendido en los metadatos que se guardan junto al vector. */
export function toPidMetadata(entry: PidKnowledgeEntry): Record<string, MetadataValue> {
  return {
    id: entry.id,
    embeddedText: entry.embeddedText,
    manufacturer: entry.manufacturer,
    model: entry.model,
    confidence: entry.confidence,
    source: entry.source,
    obdValidated: entry.obdValidated,
  }
}

/** Reconstruye el PID aprendido a partir de sus metadatos. */
export function toPidEntry(metadata: Readonly<Record<string, unknown>>): PidKnowledgeEntry {
  return {
    id: metadata.id as string,
    embeddedText: metadata.embeddedText as string,
    manufacturer: metadata.manufacturer as string,
    model: metadata.model as string,
    confidence: metadata.confidence as number,
    source: metadata.source as KnowledgeSource,
    obdValidated: metadata.obdValidated as boolean,
  }
}
