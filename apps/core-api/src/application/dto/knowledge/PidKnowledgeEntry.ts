import type { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

/** PID propietario aprendido por el sistema. */
export interface PidKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  /** Entre 0 y 1. */
  readonly confidence: number
  readonly source: KnowledgeSource
  /** Confirmado leyendo el PID en un vehiculo real y comprobando que el valor cae en rango. */
  readonly validated: boolean
}
