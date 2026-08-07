import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import type { PidObservation } from '@/application/dto/diagnosis/PidObservation.js'
import {
  PID_OBSERVATION_CATALOG,
  resolvePidObservationStatus,
} from '@/domain/pidObservationCatalog.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'

/** Nombre de la tool MCP cuyas trazas contienen lecturas de PID. */
const READ_PID_TOOL = 'read_pid'

/** Resuelve la clave de catalogo de una traza, o `null` si los args no son un PID valido. */
function toCatalogKey(args: Record<string, unknown>): string | null {
  const mode = String(args.mode ?? '').trim()
  const pid = String(args.pid ?? '').trim()
  try {
    return new PidCode(mode, pid).key
  } catch {
    return null
  }
}

/**
 * Interpreta el resultado de la tool como valor fisico.
 *
 * `Number('')` vale 0, asi que la cadena vacia se descarta antes de convertir:
 * una lectura ausente no es una lectura de cero.
 */
function toReading(result: string): number | null {
  const trimmed = result.trim()
  if (trimmed === '') return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : null
}

/** Convierte una traza de `read_pid` en observacion, o `null` si no es enriquecible. */
function toObservation(trace: ToolCallTrace): PidObservation | null {
  const code = toCatalogKey(trace.args)
  if (code === null) return null

  const def = PID_OBSERVATION_CATALOG.get(code)
  if (!def) return null

  const value = toReading(trace.result)
  if (value === null) return null

  return {
    code,
    name: def.name,
    ...(def.unit !== undefined && { unit: def.unit }),
    value,
    status: resolvePidObservationStatus(value, def),
  }
}

/**
 * Deriva las lecturas de PID enriquecidas de una sesion cognitiva.
 *
 * Es un enriquecimiento best-effort: las trazas de otras tools, con codigos
 * fuera de catalogo, con args invalidos o con resultados no numericos se
 * descartan en silencio. Si un mismo codigo se lee varias veces gana la ultima
 * lectura, conservando el orden de primera aparicion.
 *
 * @param toolCalls - Traza completa de tools invocadas por el LLM.
 * @returns Observaciones enriquecidas, una por codigo de PID leido.
 */
export function derivePidObservations(toolCalls: readonly ToolCallTrace[]): PidObservation[] {
  const byCode = new Map<string, PidObservation>()

  for (const trace of toolCalls) {
    if (trace.tool !== READ_PID_TOOL) continue
    const observation = toObservation(trace)
    if (observation) byCode.set(observation.code, observation)
  }

  return [...byCode.values()]
}
