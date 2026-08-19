import type { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

/**
 * Definicion de ECU aprendida para el indice vectorial del catalogo.
 *
 * A diferencia de `PidKnowledgeEntry`/`DtcKnowledgeEntry`, no expone `validated`:
 * las ECUs no admiten validacion OBD (la confianza sale de la fuente). Si guarda
 * las direcciones CAN y el nombre/tipo/sistema aprendidos para la busqueda semantica.
 */
export interface EcuKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  readonly responseAddr: string
  readonly requestAddr: string
  readonly name: string
  readonly type: string
  readonly system?: string
  /** Entre 0 y 1. */
  readonly confidence: number
  readonly source: KnowledgeSource
}
