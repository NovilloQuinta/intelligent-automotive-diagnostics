/** Caso de diagnostico resuelto, guardado como memoria de taller. */
export interface DiagnosisKnowledgeEntry {
  readonly id: string
  readonly embeddedText: string
  readonly manufacturer: string
  readonly model: string
  readonly symptoms: readonly string[]
  readonly pidsInvolved: readonly string[]
}
