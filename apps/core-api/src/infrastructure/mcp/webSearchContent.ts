const MAX_SNIPPET_LENGTH = 500
const DELIMITER_OPEN = '<untrusted-web-result>'
const DELIMITER_CLOSE = '</untrusted-web-result>'

const CONTROL_CHARS_REGEX = /[\x00-\x09\x0B-\x1F]/g

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : text.slice(0, maxLength)
}

function stripDelimiterEscape(text: string): string {
  return text.split(DELIMITER_CLOSE).join('')
}

function stripControlChars(text: string): string {
  return text.replace(CONTROL_CHARS_REGEX, '')
}

/**
 * Envuelve un snippet de búsqueda web en delimitadores explícitos que marcan
 * el contenido como no confiable.
 *
 * @param snippet — Texto de resultado web no confiable a sanear
 *
 * Orden de saneado:
 * 1. Truncado a {@link MAX_SNIPPET_LENGTH} caracteres
 * 2. Eliminación de `</untrusted-web-result>` literal para prevenir que
 *    un snippet malicioso "escape" del delimitador
 * 3. Eliminación de caracteres de control (`\\x00`-`\\x1F`) excepto `\\n`
 * 4. Envoltorio en `<untrusted-web-result>...</untrusted-web-result>`
 *
 * @returns El snippet saneado y envuelto en delimitadores
 */
export function wrapUntrustedResult(snippet: string): string {
  let sanitized = truncate(snippet, MAX_SNIPPET_LENGTH)
  sanitized = stripDelimiterEscape(sanitized)
  sanitized = stripControlChars(sanitized)
  return `${DELIMITER_OPEN}${sanitized}${DELIMITER_CLOSE}`
}
