/** Convierte texto en un vector normalizado para busqueda semantica. */
export type EmbeddingGenerator = (text: string) => Promise<number[]>
