import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

/**
 * Tabla de confianza del catalogo auto-expansivo (ADR-007 §4).
 *
 * Es una tabla de constantes con dos funciones puras, no un servicio: no tiene estado ni
 * dependencias. Envolverla en una clase seria una abstraccion prematura para cinco numeros.
 */

/** Ninguna entrada puede superar la certeza total. */
export const MAX_CONFIDENCE = 1

/** Lo aprendido de internet nace con poca confianza: aun no se ha visto en un vehiculo. */
export const WEB_INITIAL_CONFIDENCE = 0.3

/** Un PID/DTC de web confirmado leyendo el vehiculo real. */
export const WEB_VALIDATED_CONFIDENCE = 0.7

/** Lo aportado por un mecanico nace alto: es conocimiento de taller. */
export const MECHANIC_INITIAL_CONFIDENCE = 0.8

/** Lo aportado por un mecanico y ademas confirmado contra el vehiculo. */
export const MECHANIC_VALIDATED_CONFIDENCE = 0.9

/** Un caso de diagnostico previo nace a medio camino: fue util una vez, sin confirmar. */
export const PREVIOUS_DIAGNOSIS_INITIAL_CONFIDENCE = 0.5

/** Incremento al reutilizar con exito una entrada del catalogo. */
export const SUCCESSFUL_REUSE_BONUS = 0.2

const INITIAL_CONFIDENCE: Readonly<Record<KnowledgeSource, number>> = {
  [KnowledgeSource.Web]: WEB_INITIAL_CONFIDENCE,
  [KnowledgeSource.Mechanic]: MECHANIC_INITIAL_CONFIDENCE,
  [KnowledgeSource.PreviousDiagnosis]: PREVIOUS_DIAGNOSIS_INITIAL_CONFIDENCE,
  // Su procedencia ya es la lectura del vehiculo: nace confirmada.
  [KnowledgeSource.ObdValidated]: MAX_CONFIDENCE,
}

/**
 * Escalado al confirmar una entrada contra el vehiculo real. Solo las procedencias que
 * admiten una validacion OBD posterior tienen objetivo; el resto no sube.
 */
const VALIDATED_CONFIDENCE: Partial<Readonly<Record<KnowledgeSource, number>>> = {
  [KnowledgeSource.Web]: WEB_VALIDATED_CONFIDENCE,
  [KnowledgeSource.Mechanic]: MECHANIC_VALIDATED_CONFIDENCE,
}

/** Confianza con la que nace una entrada segun de donde venga. */
export function initialConfidenceFor(source: KnowledgeSource): number {
  return INITIAL_CONFIDENCE[source]
}

/**
 * Confianza que corresponde a una entrada recien confirmada contra el vehiculo.
 *
 * Recibe la confianza actual para poder devolverla intacta cuando la procedencia no define
 * escalado, y para no bajarla nunca: una entrada que ya supera el objetivo de su procedencia
 * (por reutilizacion exitosa) conserva su valor.
 *
 * @param source — Procedencia de la entrada validada
 * @param current — Confianza que tiene la entrada antes de validarse
 */
export function validatedConfidenceFor(source: KnowledgeSource, current: number): number {
  const target = VALIDATED_CONFIDENCE[source]
  return target === undefined ? current : Math.max(current, target)
}

/** Forma minima de una entrada que admite validacion OBD (PIDs y DTCs, no diagnosticos). */
export interface ValidatableEntry {
  readonly source: KnowledgeSource
  readonly confidence: number
  readonly validated: boolean
}

/**
 * Marca una entrada como confirmada contra el vehiculo y le aplica su escalado de confianza.
 *
 * Vive aqui, y no duplicada en cada caso de uso de validacion, para que la politica de
 * confianza tenga un unico dueño: si el escalado cambia, PIDs y DTCs no pueden divergir.
 */
export function markValidated<TEntry extends ValidatableEntry>(entry: TEntry): TEntry {
  return {
    ...entry,
    validated: true,
    confidence: validatedConfidenceFor(entry.source, entry.confidence),
  }
}

/**
 * Suma un bonus a la confianza saturando en {@link MAX_CONFIDENCE}.
 *
 * Infraestructura preparada para el escalado por reutilizacion exitosa del ADR-007 §4.
 * **No se invoca desde ningun flujo todavia:** el sistema carece de la señal "el diagnostico
 * acerto". Conectarla requiere un mecanismo de feedback explicito del mecanico (boton "¿Te
 * ayudo este diagnostico?" en la UI), fuera del alcance actual.
 */
export function boostConfidence(current: number, bonus: number): number {
  return Math.min(MAX_CONFIDENCE, current + bonus)
}
