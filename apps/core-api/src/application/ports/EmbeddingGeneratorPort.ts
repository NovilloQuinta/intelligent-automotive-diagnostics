/** Convierte texto en un vector normalizado para busqueda semantica. */
export type EmbeddingGeneratorPort = (text: string) => Promise<number[]>
