import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/** Convierte un DTC aprendido en los metadatos que se guardan junto al vector. */
export function toDtcMetadata(entry: DtcKnowledgeEntry): Record<string, MetadataValue> {
  return {
    id: entry.id,
    embeddedText: entry.embeddedText,
    manufacturer: entry.manufacturer,
    model: entry.model,
    confidence: entry.confidence,
    source: entry.source,
  }
}

/** Reconstruye el DTC aprendido a partir de sus metadatos. */
export function toDtcEntry(metadata: Readonly<Record<string, unknown>>): DtcKnowledgeEntry {
  return {
    id: metadata.id as string,
    embeddedText: metadata.embeddedText as string,
    manufacturer: metadata.manufacturer as string,
    model: metadata.model as string,
    confidence: metadata.confidence as number,
    source: metadata.source as KnowledgeSource,
  }
}
