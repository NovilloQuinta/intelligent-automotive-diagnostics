/** Mapa de abreviaturas comunes a nombre completo del fabricante. */
const ABBREVIATIONS: Record<string, string> = {
  VW: 'Volkswagen',
  GMC: 'General Motors',
}

/**
 * Sufijos corporativos ordenados de mayor a menor longitud para coincidencia
 * greedy (ej. " Motor Corp" coincide antes que " Corp" aislado).
 */
const CORPORATE_SUFFIXES = [' Motor Corp', ' AG', ' GmbH', ' S.A.', ' Corp', ' Ltd', ' Inc', ' LLC']

/** Escapa caracteres especiales de regex para usar en una expresion literal. */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Convierte un string a title case: primera letra de cada palabra en mayuscula. */
function toTitleCase(str: string): string {
  return str
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Normaliza el nombre de un fabricante de vehiculos:
 * 1. Trim
 * 2. Expansion de abreviaturas (case-insensitive)
 * 3. Eliminacion de sufijos corporativos (case-insensitive, greedy longest-first)
 * 4. Title case
 * 5. Trim final
 *
 * Es una funcion pura, sin estado ni dependencias externas.
 *
 * @param raw - Nombre crudo del fabricante (ej. "vw ag", "Toyota Motor Corp")
 * @returns Nombre normalizado (ej. "Volkswagen", "Toyota")
 */
export function normalizeManufacturer(raw: string): string {
  if (!raw || raw.trim().length === 0) {
    return ''
  }

  let result = raw.trim()

  // 2. Expandir abreviaturas (case-insensitive, word-boundary)
  for (const [abbr, full] of Object.entries(ABBREVIATIONS)) {
    const regex = new RegExp(`\\b${abbr}\\b`, 'gi')
    result = result.replace(regex, full)
  }

  // 3. Eliminar sufijos corporativos (case-insensitive, greedy longest-first)
  for (const suffix of CORPORATE_SUFFIXES) {
    const regex = new RegExp(`${escapeRegex(suffix)}$`, 'i')
    result = result.replace(regex, '')
  }

  // 4. Title case
  result = toTitleCase(result)

  // 5. Trim final
  return result.trim()
}
