/**
 * Borra de la narrativa del LLM la fontaneria interna del sistema.
 *
 * Es la capa dura de la higiene de salida: el prompt le pide al modelo que no
 * mencione identificadores ni distancias, pero un modelo obedece "casi siempre".
 * Esto lo garantiza.
 *
 * Se aplica UNA sola vez, sobre el texto ya limpio de bloque JSON, y ANTES de
 * indexar el caso: si entrara sucio al catalogo, el ruido volveria en futuros
 * prompts como "caso similar" y se retroalimentaria.
 *
 * Criterio de diseno: preferimos dejar pasar algo raro antes que destrozar
 * vocabulario legitimo de taller. Por eso los patrones son estrechos —
 * "distancia de frenado" no es una distancia vectorial y debe sobrevivir.
 */

/** UUID v4, el formato que devuelven las tools `index_*` de conocimiento. */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/**
 * Id generado por `toDiagnosisEntry`: `${Date.now().toString(36)}-${random}`.
 *
 * Exige un digito en cada mitad y 7-10 caracteres, para no comerse palabras
 * compuestas legitimas ("audi-a3", "start-stop").
 */
const BASE36_ID_PATTERN = /\b(?=[a-z0-9]*\d)[a-z0-9]{7,10}-(?=[a-z0-9]*\d)[a-z0-9]{7,10}\b/gi

/**
 * Distancia vectorial: exige un numero pegado a la palabra.
 *
 * "distancia 1.40", "(distancia 0.42)", "distancia 1.40-1.65" caen.
 * "distancia de frenado" NO.
 */
const VECTOR_DISTANCE_PATTERN =
  /\(?\s*distancias?\s*[:=]?\s*\d+[.,]\d+(\s*[-–a]\s*\d+[.,]\d+)?\s*\)?/gi

/** Confirmacion de indexado tal cual la devuelven las tools (`formatIndexedMessage`). */
const INDEXED_LINE_PATTERN = /^.*\bIndexed\s+\w+\b.*$/gim

/** Credenciales de proveedor que el modelo pudiera haber verbalizado. */
const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}/g

/** Puntuacion o parentesis que quedan huerfanos al borrar un fragmento intermedio. */
const DANGLING_PUNCTUATION = /[ \t]*,\s*([.;)])/g
const EMPTY_PARENS = /\(\s*\)/g
const REPEATED_SPACES = /[ \t]{2,}/g
const REPEATED_BLANK_LINES = /\n{3,}/g

/**
 * Devuelve la narrativa sin identificadores internos, distancias vectoriales,
 * confirmaciones de indexado ni credenciales.
 *
 * @param text - Narrativa del LLM, ya sin el bloque `---JSON---`.
 * @returns El mismo texto saneado y con la puntuacion recompuesta.
 */
export function redactInternals(text: string): string {
  return text
    .replace(INDEXED_LINE_PATTERN, '')
    .replace(UUID_PATTERN, '')
    .replace(BASE36_ID_PATTERN, '')
    .replace(VECTOR_DISTANCE_PATTERN, '')
    .replace(SECRET_PATTERN, '')
    .replace(EMPTY_PARENS, '')
    .replace(DANGLING_PUNCTUATION, '$1')
    .replace(REPEATED_SPACES, ' ')
    .replace(REPEATED_BLANK_LINES, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}
