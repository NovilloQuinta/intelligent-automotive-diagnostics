import type { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { DiagnosisSession, SessionSeverity } from '@/domain/entities/diagnosisSession.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import type { PidReading } from '@/domain/entities/pidReading.js'
import type { DtcDefinition } from '@/domain/entities/dtcDefinition.js'

/** Resultado de una consulta paginada de sesiones de diagnostico. */
export interface DiagnosisSessionPage {
  readonly items: DiagnosisSession[]
  readonly total: number
}

/** Filtros para el listado de sesiones de diagnostico. */
export interface DiagnosisSessionFilter {
  readonly userId: number
  readonly from?: string
  readonly to?: string
  readonly scenarioId?: string
  readonly severity?: SessionSeverity
  readonly limit: number
  readonly offset: number
}

/** Snapshot inmutable del resultado de una sesión: JSON del informe + severidad + recuento de DTCs. */
export interface SessionResultSnapshot {
  readonly resultJson: string
  readonly severity: SessionSeverity
  readonly dtcCount: number
}

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

  /** Busca una definición de PID por modo, código y opcionalmente fabricante/modelo. */
  findPidDefinition(
    mode: string,
    pidCode: string,
    manufacturer?: string,
    model?: string,
  ): Promise<PidDefinition | null>

  /** Devuelve todos los PIDs conocidos para un vehículo. */
  findPidsByVehicle(vehicleId: number): Promise<PidDefinition[]>

  /** Devuelve todos los PIDs de un modo (ej. '22') desde el catálogo global,
   *  sin filtrar por vehículo ni fabricante/modelo. */
  findPidsByMode(mode: string): Promise<PidDefinition[]>

  /** Registra una lectura de PID en una sesión. */
  insertPidReading(reading: PidReading): Promise<PidReading>

  /** Inicia una sesión de diagnóstico. */
  createSession(session: DiagnosisSession): Promise<DiagnosisSession>

  /** Finaliza una sesión de diagnóstico guardando opcionalmente el snapshot del resultado. */
  endSession(sessionId: number, result?: SessionResultSnapshot): Promise<void>

  /** Actualiza el resultado de una sesión existente (follow-up) sin crear una sesión nueva. */
  updateSessionResult(sessionId: number, result: SessionResultSnapshot): Promise<void>

  /** Lista paginada de sesiones de un usuario con filtros (todos en SQL, nunca en memoria). */
  findSessions(filter: DiagnosisSessionFilter): Promise<DiagnosisSessionPage>

  /** Busca una sesion concreta por id, solo si pertenece al usuario indicado.
   *  Retorna null si no existe o si es de otro usuario (mismo codigo de error). */
  findSessionById(id: number, userId: number): Promise<DiagnosisSession | null>

  /** Busca una definición de DTC por fabricante, modelo y código.
   * Retorna null si no existe en el catálogo.
   */
  findDtcDefinition(
    manufacturer: string,
    model: string,
    code: string,
  ): Promise<DtcDefinition | null>

  /** Inserta una definición de DTC o devuelve la existente si ya existe
   * (por clave única manufacturer + model + code).
   */
  upsertDtcDefinition(dtc: Omit<DtcDefinition, 'id' | 'createdAt'>): Promise<DtcDefinition>

  /** Busca una definición de DTC por código (lookup global, sin fabricante/modelo).
   * Retorna null si no existe en el catálogo.
   */
  findDtcDefinitionByCode(code: string): Promise<DtcDefinition | null>

  /** Busca una ECU por vehículo y direcciones CAN (request + response). */
  findEcuByAddress(
    vehicleId: number,
    requestAddr: string,
    responseAddr: string,
  ): Promise<EcuInfo | null>

  /** Actualiza la marca de tiempo de descubrimiento de una ECU. */
  updateEcuDiscoveredAt(ecuId: number): Promise<void>
}
