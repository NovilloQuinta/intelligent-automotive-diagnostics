import {
  MODE_CURRENT_DATA,
  PID_CONTROL_MODULE_VOLTAGE,
  PID_COOLANT_TEMP,
  PID_ENGINE_LOAD,
  PID_INTAKE_TEMP,
  PID_RPM,
  PID_SPEED,
  PID_THROTTLE_POSITION,
} from '@/domain/pids.js'

/**
 * Metadata de presentacion de un PID leido durante una sesion cognitiva.
 *
 * Es deliberadamente ligera: el simulador y los emuladores ELM327 devuelven
 * valores fisicos ya resueltos, por lo que no hace falta formula ni bytes crudos.
 */
export interface PidObservationDefinition {
  /** Nombre legible del PID en espanol. */
  readonly name: string
  /** Unidad fisica del valor (rpm, °C, km/h, %, V). */
  readonly unit?: string
  /** Limite inferior de la ventana operativa saludable, si aplica. */
  readonly minValue?: number
  /** Limite superior de la ventana operativa saludable, si aplica. */
  readonly maxValue?: number
}

/** Construye la clave de catalogo `"MODE PID"` para un PID del modo 01. */
function currentDataKey(pid: string): string {
  return `${MODE_CURRENT_DATA} ${pid}`
}

/**
 * Catalogo de PIDs que el flujo cognitivo/simulado puede leer, indexado por
 * la clave compuesta `"MODE PID"` (el mismo formato que expone `PidCode.key`).
 */
export const PID_OBSERVATION_CATALOG: ReadonlyMap<string, PidObservationDefinition> = new Map<
  string,
  PidObservationDefinition
>([
  [currentDataKey(PID_RPM), { name: 'Régimen del motor', unit: 'rpm', maxValue: 6500 }],
  [
    currentDataKey(PID_COOLANT_TEMP),
    { name: 'Temperatura del refrigerante', unit: '°C', maxValue: 100 },
  ],
  [currentDataKey(PID_SPEED), { name: 'Velocidad del vehículo', unit: 'km/h' }],
  [
    currentDataKey(PID_INTAKE_TEMP),
    { name: 'Temperatura del aire de admisión', unit: '°C', maxValue: 80 },
  ],
  [
    currentDataKey(PID_THROTTLE_POSITION),
    { name: 'Posición del acelerador', unit: '%', maxValue: 90 },
  ],
  [currentDataKey(PID_ENGINE_LOAD), { name: 'Carga calculada del motor', unit: '%', maxValue: 90 }],
  [
    currentDataKey(PID_CONTROL_MODULE_VOLTAGE),
    { name: 'Voltaje del módulo de control', unit: 'V', minValue: 11.5, maxValue: 15.5 },
  ],
])

/**
 * Calcula el veredicto de una lectura contra la ventana operativa del PID.
 *
 * @param value - Valor fisico ya resuelto de la lectura.
 * @param def - Definicion de catalogo del PID leido.
 * @returns `'review'` si el valor cae fuera de los umbrales definidos, `'ok'` en caso contrario
 *   (incluido cuando el PID no define ningun umbral).
 */
export function resolvePidObservationStatus(
  value: number,
  def: PidObservationDefinition,
): 'ok' | 'review' {
  if (def.minValue !== undefined && value < def.minValue) return 'review'
  if (def.maxValue !== undefined && value > def.maxValue) return 'review'
  return 'ok'
}
