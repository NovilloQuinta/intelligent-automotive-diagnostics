import type { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition, PidReading } from '@/domain/entities/pidDefinition.js'

/** Contrato para la persistencia del catálogo auto-expansivo de vehículos, ECUs y PIDs. */
export interface VehicleRepository {
  /** Registra un vehículo nuevo o actualiza la fecha de último avistamiento si ya existe (por VIN).
   * @throws VinDecodeError si el VIN no cumple el formato ISO 3779
   */
  upsertVehicle(profile: VehicleProfile): Promise<VehicleProfile>

  /** Busca un vehículo por su VIN.
   * @throws VinDecodeError si el VIN no cumple el formato ISO 3779
   */
  findVehicleByVin(vin: string): Promise<VehicleProfile | null>

  /** Registra una ECU asociada a un vehículo. */
  insertEcu(ecu: EcuInfo): Promise<EcuInfo>

  /** Devuelve todas las ECUs de un vehículo. */
  findEcusByVehicle(vehicleId: number): Promise<EcuInfo[]>

  /** Inserta una definición de PID en el catálogo. */
  insertPidDefinition(pid: PidDefinition): Promise<PidDefinition>

  /** Busca una definición de PID por modo, código y vehículo (o global si vehicleId es null). */
  findPidDefinition(
    mode: string,
    pidCode: string,
    vehicleId?: number,
  ): Promise<PidDefinition | null>

  /** Devuelve todos los PIDs conocidos para un vehículo. */
  findPidsByVehicle(vehicleId: number): Promise<PidDefinition[]>

  /** Registra una lectura de PID en una sesión. */
  insertPidReading(reading: PidReading): Promise<PidReading>

  /** Inicia una sesión de diagnóstico. */
  createSession(session: DiagnosisSession): Promise<DiagnosisSession>

  /** Finaliza una sesión de diagnóstico. */
  endSession(sessionId: number): Promise<void>
}
