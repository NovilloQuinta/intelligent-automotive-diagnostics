import {
  type ResolveVehicleIdentityUseCase,
  UNKNOWN_VEHICLE_FIELD,
} from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { VehicleProfile } from '@/domain/entities/VehicleProfile.js'
import { Vin } from '@/domain/value-objects/Vin.js'

/** Dependencias de {@link IdentifyVehicleUseCase}, inyectadas por constructor. */
export interface IdentifyVehicleUseCaseOptions {
  readonly identityResolver: ResolveVehicleIdentityUseCase
}

/**
 * Completa la identificacion del vehiculo con lo que sepa la cascada.
 *
 * Vive en la capa de aplicacion, y no como ayudante privado del servicio, porque lo
 * necesitan tres flujos distintos —barrido de ECUs, diagnostico cognitivo y persistencia—
 * y antes se les pasaba como funcion suelta desde infraestructura.
 */
export class IdentifyVehicleUseCase {
  constructor(private readonly options: IdentifyVehicleUseCaseOptions) {}

  /**
   * Rellena marca/modelo/año/motor con la cascada de identificacion.
   *
   * **Solo rellena lo que falta**: si el escenario o el adaptador ya traen el dato (modo
   * Docker, donde el descriptor conoce el vehiculo), se respeta. La cascada es para el
   * coche real, donde lo unico que hay es el VIN.
   *
   * @param vehicleInfo - Lo que reporta el adaptador.
   * @returns El mismo vehiculo con los huecos rellenos, o intacto si no hubo suerte.
   */
  async execute(vehicleInfo: VehicleInfo): Promise<VehicleInfo> {
    if (vehicleInfo.make !== UNKNOWN_VEHICLE_FIELD) return vehicleInfo

    const resolved = await this.options.identityResolver.execute(vehicleInfo.vin)
    if (resolved.origin === 'none') return vehicleInfo

    return new VehicleInfo({
      make: resolved.make,
      model: vehicleInfo.model === UNKNOWN_VEHICLE_FIELD ? resolved.model : vehicleInfo.model,
      year: vehicleInfo.year === 0 ? resolved.year : vehicleInfo.year,
      engineType:
        vehicleInfo.engineType === UNKNOWN_VEHICLE_FIELD
          ? resolved.engineType
          : vehicleInfo.engineType,
      vin: vehicleInfo.vin,
      vinStatus: vehicleInfo.vinStatus,
    })
  }

  /**
   * Convierte el value object {@link VehicleInfo} al perfil de entidad que exige
   * `VehicleRepository.upsertVehicle`.
   *
   * `id: 0` indica clave autogenerada en la capa de persistencia.
   */
  toVehicleProfile(vehicleInfo: VehicleInfo): VehicleProfile {
    return new VehicleProfile({
      id: 0,
      vin: new Vin(vehicleInfo.vin.value),
      make: vehicleInfo.make,
      model: vehicleInfo.model,
      year: vehicleInfo.year,
      engineType: vehicleInfo.engineType,
    })
  }
}
