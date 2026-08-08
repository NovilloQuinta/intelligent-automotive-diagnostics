/** Fila devuelta por un almacen vectorial. Menor distancia, mas parecido. */
export interface VectorMatch {
  readonly metadata: Readonly<Record<string, unknown>>
  readonly distance: number
}
