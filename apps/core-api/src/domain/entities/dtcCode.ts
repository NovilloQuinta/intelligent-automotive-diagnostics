/** Código de diagnóstico de fallo (Diagnostic Trouble Code) estándar OBD-II. */
export interface DtcCode {
  readonly code: string
  readonly description: string
}
