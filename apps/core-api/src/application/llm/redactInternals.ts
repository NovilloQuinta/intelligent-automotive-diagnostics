import { MCP_TOOL_NAMES } from '@/application/shared/mcpToolNames.js'

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

/**
 * Nombres reales de las tools MCP registradas.
 *
 * El prompt ya pide no nombrarlas (`INTERNALS_INSTRUCTIONS`); esto es la capa dura
 * para cuando el modelo lo hace igual, sobre todo si se le pregunta sin rodeos
 * ("que tools tienes"). La lista sale de `MCP_TOOL_NAMES`, fuente unica compartida
 * con `scripts/eval/invariants.ts` (INV-5).
 */
const TOOL_NAME_PATTERN = new RegExp(`\\b(${MCP_TOOL_NAMES.join('|')})\\b`, 'gi')

/** Credenciales de proveedor que el modelo pudiera haber verbalizado. */
const SECRET_PATTERN = /\bsk-[A-Za-z0-9_-]{8,}/g

/** Puntuacion o parentesis que quedan huerfanos al borrar un fragmento intermedio. */
const DANGLING_PUNCTUATION = /[ \t]*,\s*([.;)])/g
const EMPTY_PARENS = /\(\s*\)/g

/** Marcado markdown que se queda vacio al borrar el nombre de tool que envolvia. */
const EMPTY_BACKTICKS = /`\s*`/g
const EMPTY_BOLD = /\*\*\s*\*\*/g

/** Coma duplicada al borrar un inciso entero ("el caso previo, distancia 0.31, encaja"). */
const REPEATED_COMMAS = /,(\s*,)+/g

/**
 * Espacio huerfano delante de la puntuacion, del fragmento que se acaba de borrar.
 *
 * Sin esto la narrativa queda con " ." o " ,", que delata que hay una tuberia
 * detras igual que delataba el identificador que se acaba de quitar.
 */
const SPACE_BEFORE_PUNCTUATION = /[ \t]+([.,;:!?)])/g
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
    .replace(TOOL_NAME_PATTERN, '')
    .replace(EMPTY_BACKTICKS, '')
    .replace(EMPTY_BOLD, '')
    .replace(EMPTY_PARENS, '')
    .replace(DANGLING_PUNCTUATION, '$1')
    .replace(REPEATED_COMMAS, ',')
    .replace(SPACE_BEFORE_PUNCTUATION, '$1')
    .replace(REPEATED_SPACES, ' ')
    .replace(REPEATED_BLANK_LINES, '\n\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}
