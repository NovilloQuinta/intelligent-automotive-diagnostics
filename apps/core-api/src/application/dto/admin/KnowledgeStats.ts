/** Conteo y muestra de un indice del catalogo vectorial. */
export interface KnowledgeIndexSummary {
  readonly count: number
  readonly sample: readonly Readonly<Record<string, unknown>>[]
}

/** Resumen del catalogo vectorial: uno por cada indice (ADR-007 §3). */
export interface KnowledgeStats {
  readonly pids: KnowledgeIndexSummary
  readonly dtcs: KnowledgeIndexSummary
  readonly diagnoses: KnowledgeIndexSummary
}
