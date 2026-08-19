import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
import { ECU_TYPE_UNKNOWN } from '@/domain/ecuAddressCatalog.js'

/** Confianza mínima para resolver una ECU `UNKNOWN` a su nombre/tipo reales (ADR-007, opción B). */
export const RESOLVE_CONFIDENCE_THRESHOLD = 0.7

/** Lookup de una definición de ECU por su dirección de respuesta CAN. */
export type EcuDefinitionLookup = (responseAddr: string) => EcuDefinition | undefined

/**
 * Resuelve las ECUs `UNKNOWN` de un auto-scan contra el catálogo auto-expansivo.
 *
 * Es una función pura: recibe las ECUs descubiertas y un `lookup` de definiciones
 * ya cargadas (el llamador acota por `manufacturer`/`model`). Una ECU `UNKNOWN` se
 * resuelve a su `name`/`type` reales solo si existe definición con `confidence ≥
 * {@link RESOLVE_CONFIDENCE_THRESHOLD}`; en caso contrario (sin match o confianza
 * baja) se mantiene `UNKNOWN`. Las ECUs ya resueltas (ej. ECM) se devuelven intactas.
 *
 * @param ecus - ECUs descubiertas por el auto-scan.
 * @param lookup - Devuelve la definición de ECU para una dirección de respuesta, o `undefined`.
 * @returns Las mismas ECUs con `name`/`type` resueltos donde proceda.
 */
export function resolveEcuDefinitions(
  ecus: readonly EcuInfo[],
  lookup: EcuDefinitionLookup,
): EcuInfo[] {
  return ecus.map((ecu) => {
    if (ecu.type !== ECU_TYPE_UNKNOWN) return ecu
    const definition = lookup(ecu.responseAddr)
    if (!definition || definition.confidence < RESOLVE_CONFIDENCE_THRESHOLD) return ecu
    return new EcuInfo({
      id: ecu.id,
      vehicleId: ecu.vehicleId,
      name: definition.name,
      requestAddr: ecu.requestAddr,
      responseAddr: ecu.responseAddr,
      type: definition.type,
      protocol: ecu.protocol,
      discoveredAt: ecu.discoveredAt,
      // El nombre ya no viene de la norma sino de lo que aprendio el agente, y
      // eso se muestra: mismo criterio que los PIDs descubiertos por la IA.
      source: 'ai',
    })
  })
}
