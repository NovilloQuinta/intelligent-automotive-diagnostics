/** Definicion de un codigo DTC (Diagnostic Trouble Code) vinculado a un fabricante y modelo.
 * Representa una entrada del catalogo auto-expansivo de definiciones de DTC.
 */
export interface DtcDefinition {
  readonly id: number
  readonly manufacturer: string
  readonly model: string
  readonly code: string
  readonly description?: string
  readonly confidence: number
  readonly source: string
  readonly createdAt?: string
}
