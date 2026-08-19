import type { MetadataValue } from '@/application/dto/vector/VectorRecord.js'
import type { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

/**
 * Campos comunes a las entradas del catalogo que admiten validacion OBD (PIDs y DTCs).
 *
 * `DiagnosisKnowledgeEntry` queda fuera a proposito: no tiene `validated` y ademas serializa
 * listas, asi que su mapper no comparte forma con estos dos.
 */
export interface ValidatableKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  readonly confidence: number
  readonly source: KnowledgeSource
  readonly validated: boolean
}

/**
 * Serializa los campos comunes de una entrada validable.
 *
 * PIDs y DTCs comparten forma exacta, asi que comparten mapper: mantener dos copias identicas
 * dejaria que divergieran en silencio. Cada tipo conserva su mapper con nombre propio como
 * punto de extension para cuando alguno gane campos que el otro no tenga.
 */
export function toValidatableMetadata(
  entry: ValidatableKnowledgeEntry,
): Record<string, MetadataValue> {
  return {
    id: entry.id,
    embeddedText: entry.embeddedText,
    manufacturer: entry.manufacturer,
    model: entry.model,
    confidence: entry.confidence,
    source: entry.source,
    validated: entry.validated,
  }
}

/** Reconstruye los campos comunes de una entrada validable desde sus metadatos. */
export function toValidatableEntry(
  metadata: Readonly<Record<string, unknown>>,
): ValidatableKnowledgeEntry {
  return {
    id: metadata.id as string,
    embeddedText: metadata.embeddedText as string,
    manufacturer: metadata.manufacturer as string,
    model: metadata.model as string,
    confidence: metadata.confidence as number,
    source: metadata.source as KnowledgeSource,
    validated: metadata.validated as boolean,
  }
}
