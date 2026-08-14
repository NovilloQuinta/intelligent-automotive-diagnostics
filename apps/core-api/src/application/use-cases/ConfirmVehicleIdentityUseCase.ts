import type { Vin } from '@/domain/value-objects/vin.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import { initialConfidenceFor } from '@/application/knowledge/confidenceScale.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import { UNKNOWN_VEHICLE_FIELD } from '@/application/use-cases/ResolveVehicleIdentityUseCase.js'

/** Datos que aporta el mecánico desde la pantalla de confirmación. */
export interface ConfirmVehicleIdentityInput {
  readonly vin: Vin
  readonly make: string
  readonly model?: string
  readonly year?: number
  readonly engineType?: string
}

/** Marca conocida frente a la que se afirma, cuando no coinciden. */
export interface VehicleIdentityConflict {
  readonly known: string
  readonly claimed: string
}

/** Qué acabó pasando con lo que aportó el mecánico. */
export interface ConfirmVehicleIdentityOutput {
  readonly vehicle: VehicleProfile
  /** `true` si la marca subió al catálogo de WMI, además de guardarse en el vehículo. */
  readonly promoted: boolean
  /** Presente cuando el WMI ya tenía otra marca: se conserva la conocida. */
  readonly conflict?: VehicleIdentityConflict
  /** Incoherencias que no bloquean, para que la pantalla las pueda mostrar. */
  readonly warnings: readonly string[]
}

/** El repositorio es obligatorio: sin persistencia no hay nada que confirmar. */
export interface ConfirmVehicleIdentityUseCaseOptions {
  readonly vehicleRepo: VehicleRepository
  readonly logger: LoggerPort
}

/**
 * Registra la identificación que aporta el mecánico delante del coche.
 *
 * Es la última rama de la cascada y la de más confianza — nadie sabe mejor que
 * él que tiene delante un 208 1.5 BlueHDi — pero también la única que puede
 * teclear mal. `MECHANIC_INITIAL_CONFIDENCE` es 0.8 frente al 0.3 de la web, así
 * que un error suyo gana a un acierto de internet.
 *
 * De ahí el reparto: **lo que dice se aplica siempre a su vehículo** (una fila,
 * por VIN, reversible reconectando), y **solo la marca puede subir al catálogo
 * por WMI**, que afecta a todos los coches futuros de ese fabricante.
 *
 * Coherencia que sí se comprueba: el año contra la posición 10 del VIN, que es
 * regla determinista de la ISO 3779. La comprobación "marca contra país del WMI"
 * se deja fuera a propósito: exigiría una tabla marca → país, que es justo el
 * tipo de dato estático que esta cascada vino a eliminar, y además daría falsos
 * positivos legítimos — Ford fabrica bajo `WF0` en Europa y `1F1` en EEUU.
 */
export class ConfirmVehicleIdentityUseCase {
  constructor(private readonly options: ConfirmVehicleIdentityUseCaseOptions) {}

  async execute(input: ConfirmVehicleIdentityInput): Promise<ConfirmVehicleIdentityOutput> {
    // La entidad normaliza y valida el nombre: si no tiene forma de marca, no
    // llega a tocar la BBDD. La barrera vive en el dominio y no en el formulario
    // porque la API es otra puerta de entrada.
    const candidate = new VehicleIdentity({
      id: 0,
      wmi: input.vin.wmi,
      manufacturer: input.make,
      confidence: initialConfidenceFor(KnowledgeSource.Mechanic),
      source: 'mechanic',
    })

    const conflict = await this.findConflict(candidate)
    const vehicle = await this.saveVehicle(input, candidate.manufacturer)

    if (!conflict) await this.promote(candidate)

    return {
      vehicle,
      promoted: !conflict,
      conflict,
      warnings: this.warningsFor(input),
    }
  }

  /** El WMI ya tenía otra marca: se conserva la conocida y se informa. */
  private async findConflict(
    candidate: VehicleIdentity,
  ): Promise<VehicleIdentityConflict | undefined> {
    const known = await this.options.vehicleRepo.findVehicleIdentityByWmi(candidate.wmi)
    if (!known || known.manufacturer === candidate.manufacturer) return undefined
    return { known: known.manufacturer, claimed: candidate.manufacturer }
  }

  /** Guarda el vehículo del mecánico: un coche, corregible reconectando. */
  private async saveVehicle(
    input: ConfirmVehicleIdentityInput,
    manufacturer: string,
  ): Promise<VehicleProfile> {
    return this.options.vehicleRepo.upsertVehicle(
      new VehicleProfile({
        id: 0,
        make: manufacturer,
        model: input.model?.trim() || UNKNOWN_VEHICLE_FIELD,
        year: input.year ?? input.vin.modelYear ?? 0,
        engineType: input.engineType?.trim() || UNKNOWN_VEHICLE_FIELD,
        vin: input.vin,
      }),
    )
  }

  /** Sube la marca al catálogo por WMI. Nunca el modelo: el WMI no lo determina. */
  private async promote(candidate: VehicleIdentity): Promise<void> {
    await this.options.vehicleRepo.upsertVehicleIdentity({
      wmi: candidate.wmi,
      manufacturer: candidate.manufacturer,
      confidence: candidate.confidence,
      source: candidate.source,
    })
  }

  /** Incoherencias que se avisan sin bloquear: el VIN europeo puede no codificar el año. */
  private warningsFor(input: ConfirmVehicleIdentityInput): string[] {
    const decoded = input.vin.modelYear
    if (input.year === undefined || decoded === null || input.year === decoded) return []
    return [`El año indicado (${input.year}) no coincide con el que codifica el VIN (${decoded}).`]
  }
}
