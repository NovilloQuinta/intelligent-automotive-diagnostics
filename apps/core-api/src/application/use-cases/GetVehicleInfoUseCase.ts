import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleInfoOutput } from '@/application/dto/diagnosis/VehicleInfoOutput.js'
import {
  type ResolveVehicleIdentityUseCase,
  UNKNOWN_VEHICLE_FIELD,
} from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/Vin.js'

/** Campos decodificados vacios: VIN ausente, con ruido o {@link FALLBACK_VIN}. */
const UNDECODED_VIN = {
  manufacturer: null,
  region: null,
  modelYearDecoded: null,
} as const

/** Metadatos que un escenario puede imponer sobre lo que reporta el adaptador. */
export interface VehicleMetadataOverrides {
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
}

/** Dependencias de {@link GetVehicleInfoUseCase}, inyectadas por constructor. */
export interface GetVehicleInfoUseCaseOptions {
  readonly identityResolver: ResolveVehicleIdentityUseCase
}

/**
 * Identifica el vehiculo activo: lee el VIN de la ECU y lo decodifica.
 *
 * Recibe el `ObdRepository` ya resuelto y, aparte, los metadatos del escenario si los hay:
 * **saber que escenarios existen es infraestructura**, y este caso de uso no debe conocer
 * ni el catalogo de escenarios ni el modo de conexion. Solo sabe que alguien puede
 * imponerle marca y modelo.
 */
export class GetVehicleInfoUseCase {
  constructor(private readonly options: GetVehicleInfoUseCaseOptions) {}

  /**
   * @param repository - Repositorio OBD del vehiculo activo, ya resuelto.
   * @param overrides - Metadatos del escenario, cuando se corre contra el emulador. En
   *   conexion directa no hay descriptor y se respeta lo que devuelva el adaptador.
   * @returns Identificacion del vehiculo con los campos derivados del VIN.
   */
  async execute(
    repository: ObdRepository,
    overrides?: VehicleMetadataOverrides,
  ): Promise<VehicleInfoOutput> {
    const info = await repository.getVehicleInfo()
    const vin = String(info.vin)
    const vinStatus: VehicleInfoOutput['vinStatus'] =
      info.vinStatus ?? (vin === FALLBACK_VIN ? 'unreadable' : 'read')

    return {
      vin,
      make: overrides?.make ?? info.make,
      model: overrides?.model ?? info.model,
      year: overrides?.year ?? info.year,
      engineType: overrides?.engineType ?? info.engineType,
      vinStatus,
      ...(await this.decodeVin(vin)),
    }
  }

  /**
   * Deriva fabricante, region y anio de modelo a partir del VIN crudo.
   *
   * Nunca lanza: un VIN ilegible degrada a {@link UNDECODED_VIN} en vez de tumbar la
   * identificacion entera.
   */
  private async decodeVin(raw: string): Promise<{
    manufacturer: string | null
    region: { country: string; region: string } | null
    modelYearDecoded: number | null
  }> {
    // FALLBACK_VIN es sintacticamente valido (17 'X'), asi que el VO le asignaria
    // un anio de modelo real por la posicion 10. Es un placeholder, no un vehiculo:
    // se descarta antes de decodificar.
    if (raw === FALLBACK_VIN) return UNDECODED_VIN
    try {
      const vin = new Vin(raw)
      // Region y anio son reglas posicionales de la ISO 3779 y las resuelve el VO.
      // El fabricante no: es una consulta al catalogo, que puede aprender.
      const identity = await this.options.identityResolver.execute(vin)
      return {
        manufacturer: identity.make === UNKNOWN_VEHICLE_FIELD ? null : identity.make,
        region: vin.wmiRegion,
        modelYearDecoded: vin.modelYear,
      }
    } catch {
      return UNDECODED_VIN
    }
  }
}
