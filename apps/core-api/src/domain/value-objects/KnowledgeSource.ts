/** Procedencia de una entrada del catalogo. Determina su confianza inicial (ADR-007 §4). */
export enum KnowledgeSource {
  Web = 'web',
  Mechanic = 'mechanic',
  PreviousDiagnosis = 'previous_diagnosis',
  ObdValidated = 'obd_validated',
}
