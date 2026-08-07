import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/** Los metadatos solo admiten escalares, asi que las listas se serializan aqui. */
function serializeList(values: readonly string[]): string {
  return JSON.stringify(values)
}

/** Devuelve vacio si el valor falta o esta corrupto. */
function deserializeList(value: unknown): string[] {
  if (typeof value !== 'string' || value.length === 0) {
    return []
  }

  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** Convierte un caso de diagnostico en los metadatos que se guardan junto al vector. */
export function toDiagnosisMetadata(entry: DiagnosisKnowledgeEntry): Record<string, MetadataValue> {
  return {
    id: entry.id,
    embeddedText: entry.embeddedText,
    manufacturer: entry.manufacturer,
    model: entry.model,
    symptoms: serializeList(entry.symptoms),
    pidsInvolved: serializeList(entry.pidsInvolved),
    confidence: entry.confidence,
    source: entry.source,
  }
}

/** Reconstruye el caso de diagnostico a partir de sus metadatos. */
export function toDiagnosisEntry(
  metadata: Readonly<Record<string, unknown>>,
): DiagnosisKnowledgeEntry {
  return {
    id: metadata.id as string,
    embeddedText: metadata.embeddedText as string,
    manufacturer: metadata.manufacturer as string,
    model: metadata.model as string,
    symptoms: deserializeList(metadata.symptoms),
    pidsInvolved: deserializeList(metadata.pidsInvolved),
    confidence: metadata.confidence as number,
    source: metadata.source as KnowledgeSource,
  }
}
