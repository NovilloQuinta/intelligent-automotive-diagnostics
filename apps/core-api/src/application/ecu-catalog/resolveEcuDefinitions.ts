import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
import { ECU_TYPE_UNKNOWN } from '@/domain/catalogs/ecuAddressCatalog.js'

/** Lookup de una definición de ECU por su dirección de respuesta CAN. */
export type EcuDefinitionLookup = (responseAddr: string) => EcuDefinition | undefined

/**
 * Resuelve las ECUs `UNKNOWN` de un auto-scan contra el catálogo auto-expansivo.
 *
 * Es una función pura: recibe las ECUs descubiertas y un `lookup` de definiciones ya
 * cargadas (el llamador acota por fabricante). Una ECU `UNKNOWN` se resuelve a su
 * `name`/`type` reales siempre que exista definición; sin match se mantiene `UNKNOWN`, y
 * las ECUs que ya dicta la norma (ej. el ECM) se devuelven intactas.
 *
 * **No filtra por confianza a propósito.** La procedencia `web` —la única que el agente
 * puede producir— nace en 0.3, así que cualquier umbral por encima dejaría el catálogo
 * aprendido invisible para siempre. La confianza no se pierde: se guarda en
 * `ecu_definitions` y ordena la búsqueda, de modo que gana la definición más fiable. Y lo
 * resuelto sale marcado `source: 'ai'`, que es la advertencia que le corresponde: el
 * mecánico ve que es una deducción, no una norma.
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
    if (!definition) return ecu
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
