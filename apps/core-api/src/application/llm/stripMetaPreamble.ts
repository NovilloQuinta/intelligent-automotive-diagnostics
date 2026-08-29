/** Borra una frase inicial de "pensar en voz alta" en ingles antes del diagnostico real. */
const META_PREAMBLE_PATTERN =
  /^(?:i(?:'m| am)? (?:now |going to |will )?have\b.*?\.|let me\b.*?\.|i(?:'ve| have) (?:reviewed|analyzed|checked)\b.*?\.|here is my analysis[:.]?|based on (?:my|the) (?:analysis|data|review)\b.*?[:.])\s*/i

/** El modelo a veces encadena dos frases meta seguidas (anuncio + "aqui esta mi analisis"): se repite hasta que no quede ninguna al inicio. */
export function stripMetaPreamble(text: string): string {
  let current = text
  let next = current.replace(META_PREAMBLE_PATTERN, '').trimStart()
  while (next.length < current.length) {
    current = next
    next = current.replace(META_PREAMBLE_PATTERN, '').trimStart()
  }
  return current
}
