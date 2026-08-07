/**
 * Lectura de PID enriquecida con la metadata del catalogo de dominio.
 *
 * Se deriva de las llamadas `read_pid` que el LLM resuelve durante una sesion
 * cognitiva, para que la UI pueda mostrar nombre, unidad y veredicto.
 */
export interface PidObservation {
  /** Codigo compuesto del PID en formato `PidCode.key` (ej. `"01 11"`). */
  readonly code: string
  /** Nombre legible del PID. */
  readonly name: string
  /** Unidad fisica del valor, si el catalogo la define. */
  readonly unit?: string
  /** Valor fisico leido. */
  readonly value: number
  /** Veredicto de la lectura contra la ventana operativa del PID. */
  readonly status: 'ok' | 'review'
}
