import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/** PID propietario aprendido por el sistema. */
export interface PidKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  /** Entre 0 y 1. */
  readonly confidence: number
  readonly source: KnowledgeSource
  readonly obdValidated: boolean
}
