import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

/**
 * Persiste las ECUs descubiertas por el barrido, deduplicando por direcciones CAN.
 *
 * Vive aqui, y no dentro de las tools MCP donde nacio, porque la necesitan dos
 * llamadores: la tool `get_ecu_info` del agente y `DiagnosisService.getEcuInfo`,
 * que es por donde entra la UI. Mientras solo la usaba el agente, un barrido
 * lanzado desde la pantalla de topologia dibujaba el mapa y no dejaba rastro.
 *
 * Escribe en `ecus` —que centralitas tiene **este** vehiculo—, no en
 * `ecu_definitions`, que es el conocimiento reutilizable por marca y modelo y lo
 * alimenta el agente con `index_ecu`.
 *
 * @param vehicleRepo - Repositorio de persistencia.
 * @param vehicleId - Vehiculo al que pertenecen las ECUs.
 * @param ecus - ECUs descubiertas, aun sin `id` ni `vehicleId`.
 */
export async function persistDiscoveredEcus(
  vehicleRepo: VehicleRepository,
  vehicleId: number,
  ecus: readonly EcuInfo[],
): Promise<void> {
  await Promise.all(
    ecus.map(async (ecu) => {
      const existing = await vehicleRepo.findEcuByAddress(
        vehicleId,
        ecu.requestAddr,
        ecu.responseAddr,
      )
      if (existing?.id) {
        await vehicleRepo.updateEcuDiscoveredAt(existing.id)
        return
      }
      await vehicleRepo.insertEcu(
        new EcuInfo({
          id: 0,
          vehicleId,
          name: ecu.name,
          requestAddr: ecu.requestAddr,
          responseAddr: ecu.responseAddr,
          type: ecu.type,
          protocol: ecu.protocol,
        }),
      )
    }),
  )
}
