import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/** Codigo DTC especifico de fabricante aprendido por el sistema. */
export interface DtcKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  /** Entre 0 y 1. */
  readonly confidence: number
  readonly source: KnowledgeSource
}
