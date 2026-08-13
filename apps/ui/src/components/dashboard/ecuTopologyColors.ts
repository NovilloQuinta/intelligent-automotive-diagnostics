import { COLORS } from './types'

/**
 * Azul del bus: no esta en `COLORS` pero ya se usa como extremo frio de los
 * degradados de `GRADIENTS` (coolant/intake), asi que no introduce un tono nuevo
 * a la paleta.
 */
const BUS_BLUE = '#1e6bff'

/**
 * Gris neutro de las ECU sin tipo catalogado.
 *
 * Decision deliberada: **todo** lo no catalogado comparte este color en vez de
 * derivar uno por hashing del string. Un color distinto por tipo desconocido
 * insinuaria una semantica que no existe; el gris comunica "no identificada",
 * que es informacion real para el mecanico. Los nodos siguen distinguiendose
 * entre si por su nombre.
 */
export const ECU_TOPOLOGY_FALLBACK_COLOR = '#8b949e'

/**
 * Color por tipo de ECU, reutilizando los tokens de `COLORS`.
 *
 * El criterio es semantico, no estetico: SRS (airbags) hereda `destructive`
 * porque es el sistema critico de seguridad, ECM se lleva el `primary` de la
 * marca por ser el nucleo del diagnostico, y ABS toma `warning` por su papel en
 * frenada.
 */
const ECU_TYPE_COLORS: Readonly<Record<string, string>> = {
  ECM: COLORS.primary,
  TCM: COLORS.accent,
  ABS: COLORS.warning,
  SRS: COLORS.destructive,
  BCM: COLORS.accentMuted,
  IPC: BUS_BLUE,
}

/**
 * Devuelve el color del nodo de una ECU segun su tipo.
 *
 * Nunca lanza ni devuelve `undefined`: un tipo desconocido, vacio o con otra
 * capitalizacion cae en {@link ECU_TOPOLOGY_FALLBACK_COLOR}.
 */
export function getEcuTopologyColor(type: string): string {
  return ECU_TYPE_COLORS[type?.toUpperCase()] ?? ECU_TOPOLOGY_FALLBACK_COLOR
}
