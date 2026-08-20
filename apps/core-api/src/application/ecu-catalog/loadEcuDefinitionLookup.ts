import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { ECU_TYPE_UNKNOWN } from '@/domain/catalogs/ecuAddressCatalog.js'
import type { EcuDefinitionLookup } from './resolveEcuDefinitions.js'

/**
 * Carga del catalogo las definiciones de las ECUs sin identificar.
 *
 * Vive en aplicacion, y no en la capa MCP donde nacio, porque **los dos caminos
 * que devuelven ECUs deben resolver igual**: la tool del agente y el `GET
 * /api/ecu-info` que pinta el mapa de topologia. Tenerlo solo en el primero era
 * lo que hacia que el mapa siguiera mostrando `ECU 7E9 / UNKNOWN` despues de que
 * el agente ya hubiera averiguado que era la caja de cambios.
 *
 * Solo consulta las direcciones `UNKNOWN`: lo que la norma ya estandariza no se
 * busca en el catalogo.
 *
 * @param vehicleRepo - Repositorio del catalogo de vehiculos.
 * @param manufacturer - Fabricante del vehiculo identificado.
 * @param model - Modelo del vehiculo identificado.
 * @param ecus - ECUs descubiertas en el bus.
 * @returns Funcion de consulta por direccion de respuesta.
 */
export async function loadEcuDefinitionLookup(
  vehicleRepo: VehicleRepository,
  manufacturer: string,
  model: string,
  ecus: readonly EcuInfo[],
): Promise<EcuDefinitionLookup> {
  const unknownAddresses = [
    ...new Set(ecus.filter((ecu) => ecu.type === ECU_TYPE_UNKNOWN).map((ecu) => ecu.responseAddr)),
  ]

  const definitions = await Promise.all(
    unknownAddresses.map((address) =>
      vehicleRepo.findEcuDefinitionByAddress(manufacturer, model, address),
    ),
  )

  const byAddress = new Map<string, EcuDefinition>()
  definitions.forEach((definition, index) => {
    if (definition) byAddress.set(unknownAddresses[index], definition)
  })

  return (responseAddr) => byAddress.get(responseAddr)
}
