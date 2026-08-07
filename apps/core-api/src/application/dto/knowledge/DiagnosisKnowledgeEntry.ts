import type { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/**
 * Caso de diagnostico resuelto, guardado como memoria de taller.
 *
 * A diferencia de `PidKnowledgeEntry` y `DtcKnowledgeEntry`, no expone `validated`: no existe
 * ninguna lectura OBD que confirme un caso de diagnostico. Su unica forma de confirmarse es
 * reutilizarse con exito, que ya se modela subiendo `confidence` (ADR-007 §4). Ver
 * `design.md` §1 del cambio `add-knowledge-confidence-validation`.
 */
export interface DiagnosisKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  readonly symptoms: readonly string[]
  readonly pidsInvolved: readonly string[]
  /** Entre 0 y 1. */
  readonly confidence: number
  readonly source: KnowledgeSource
}
