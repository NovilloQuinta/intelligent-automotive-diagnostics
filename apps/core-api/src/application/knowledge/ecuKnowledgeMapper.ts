import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { EcuKnowledgeEntry } from '@/application/dto/knowledge/EcuKnowledgeEntry.js'
import type { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

/** Convierte una ECU aprendida en los metadatos que se guardan junto al vector. */
export function toEcuMetadata(entry: EcuKnowledgeEntry): Record<string, MetadataValue> {
  return {
    id: entry.id,
    embeddedText: entry.embeddedText,
    manufacturer: entry.manufacturer,
    model: entry.model,
    responseAddr: entry.responseAddr,
    requestAddr: entry.requestAddr,
    name: entry.name,
    type: entry.type,
    system: entry.system ?? '',
    confidence: entry.confidence,
    source: entry.source,
  }
}

/** Reconstruye la ECU aprendida a partir de sus metadatos. */
export function toEcuEntry(metadata: Readonly<Record<string, unknown>>): EcuKnowledgeEntry {
  return {
    id: metadata.id as string,
    embeddedText: metadata.embeddedText as string,
    manufacturer: metadata.manufacturer as string,
    model: metadata.model as string,
    responseAddr: metadata.responseAddr as string,
    requestAddr: metadata.requestAddr as string,
    name: metadata.name as string,
    type: metadata.type as string,
    system: (metadata.system as string) || undefined,
    confidence: metadata.confidence as number,
    source: metadata.source as KnowledgeSource,
  }
}
