import type { DiagnosticsDb } from './db.js'
import type {
  VehicleRepository,
  DiagnosisSessionFilter,
  DiagnosisSessionPage,
  SessionResultSnapshot,
} from '@/application/ports/VehicleRepository.js'
import type { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import type { PidReading } from '@/domain/entities/pidReading.js'
import type { DtcDefinition } from '@/domain/entities/dtcDefinition.js'
import type { EcuDefinition } from '@/domain/entities/ecuDefinition.js'
import type { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import { VehicleStore } from './vehicle/vehicleStore.js'
import { VehicleIdentityStore } from './vehicle/vehicleIdentityStore.js'
import { EcuStore } from './vehicle/ecuStore.js'
import { PidStore } from './vehicle/pidStore.js'
import { SessionStore } from './vehicle/sessionStore.js'
import { DtcStore } from './vehicle/dtcStore.js'

/**
 * Implementación de {@link VehicleRepository} con SQLite via Drizzle ORM.
 *
 * Es una fachada: el puerto agrupa seis agregados —vehículos, identidades WMI, ECUs,
 * PIDs, sesiones y DTCs— y cada uno vive en su propio store bajo `vehicle/`, del mismo
 * tamaño que los demás repositorios del proyecto. Esta clase existe porque el puerto es
 * uno solo y lo consumen catorce ficheros: partirlo obligaría a tocarlos todos.
 */
export class SqliteVehicleRepository implements VehicleRepository {
  private readonly vehicles: VehicleStore
  private readonly identities: VehicleIdentityStore
  private readonly ecus: EcuStore
  private readonly pids: PidStore
  private readonly sessions: SessionStore
  private readonly dtcs: DtcStore

  constructor(db: DiagnosticsDb) {
    this.vehicles = new VehicleStore(db)
    this.identities = new VehicleIdentityStore(db)
    this.ecus = new EcuStore(db)
    this.pids = new PidStore(db)
    this.sessions = new SessionStore(db)
    this.dtcs = new DtcStore(db)
  }

  /** @inheritDoc */
  async upsertVehicle(profile: VehicleProfile): Promise<VehicleProfile> {
    return this.vehicles.upsertVehicle(profile)
  }

  /** @inheritDoc */
  async findVehicleByVin(vin: string): Promise<VehicleProfile | null> {
    return this.vehicles.findVehicleByVin(vin)
  }

  /** @inheritDoc */
  async findVehicleIdentityByWmi(wmi: string): Promise<VehicleIdentity | null> {
    return this.identities.findVehicleIdentityByWmi(wmi)
  }

  /** @inheritDoc */
  async upsertVehicleIdentity(
    identity: Omit<VehicleIdentity, 'id' | 'createdAt'>,
  ): Promise<VehicleIdentity> {
    return this.identities.upsertVehicleIdentity(identity)
  }

  /** @inheritDoc */
  async insertEcu(ecu: EcuInfo): Promise<EcuInfo> {
    return this.ecus.insertEcu(ecu)
  }

  /** @inheritDoc */
  async findEcusByVehicle(vehicleId: number): Promise<EcuInfo[]> {
    return this.ecus.findEcusByVehicle(vehicleId)
  }

  /** @inheritDoc */
  async insertPidDefinition(pid: PidDefinition): Promise<PidDefinition> {
    return this.pids.insertPidDefinition(pid)
  }

  /** @inheritDoc */
  async findPidDefinition(
    mode: string,
    pidCode: string,
    manufacturer?: string,
    model?: string,
  ): Promise<PidDefinition | null> {
    return this.pids.findPidDefinition(mode, pidCode, manufacturer, model)
  }

  /** @inheritDoc */
  async findPidsByManufacturerModel(manufacturer: string, model: string): Promise<PidDefinition[]> {
    return this.pids.findPidsByManufacturerModel(manufacturer, model)
  }

  /** @inheritDoc */
  async findPidsByMode(mode: string): Promise<PidDefinition[]> {
    return this.pids.findPidsByMode(mode)
  }

  /** @inheritDoc */
  async insertPidReading(reading: PidReading): Promise<PidReading> {
    return this.pids.insertPidReading(reading)
  }

  /** @inheritDoc */
  async createSession(session: DiagnosisSession): Promise<DiagnosisSession> {
    return this.sessions.createSession(session)
  }

  /** @inheritDoc */
  async endSession(sessionId: number, result?: SessionResultSnapshot): Promise<void> {
    return this.sessions.endSession(sessionId, result)
  }

  /** @inheritDoc */
  async updateSessionResult(sessionId: number, result: SessionResultSnapshot): Promise<void> {
    return this.sessions.updateSessionResult(sessionId, result)
  }

  /** @inheritDoc */
  async findSessions(filter: DiagnosisSessionFilter): Promise<DiagnosisSessionPage> {
    return this.sessions.findSessions(filter)
  }

  /** @inheritDoc */
  async findSessionById(id: number, userId: number): Promise<DiagnosisSession | null> {
    return this.sessions.findSessionById(id, userId)
  }

  /** @inheritDoc */
  async findDtcDefinition(
    manufacturer: string,
    model: string,
    code: string,
  ): Promise<DtcDefinition | null> {
    return this.dtcs.findDtcDefinition(manufacturer, model, code)
  }

  /** @inheritDoc */
  async findDtcDefinitionByCode(code: string): Promise<DtcDefinition | null> {
    return this.dtcs.findDtcDefinitionByCode(code)
  }

  /** @inheritDoc */
  async upsertDtcDefinition(dtc: Omit<DtcDefinition, 'id' | 'createdAt'>): Promise<DtcDefinition> {
    return this.dtcs.upsertDtcDefinition(dtc)
  }

  /** @inheritDoc */
  async findEcuByAddress(
    vehicleId: number,
    requestAddr: string,
    responseAddr: string,
  ): Promise<EcuInfo | null> {
    return this.ecus.findEcuByAddress(vehicleId, requestAddr, responseAddr)
  }

  /** @inheritDoc */
  async updateEcuDiscoveredAt(ecuId: number): Promise<void> {
    return this.ecus.updateEcuDiscoveredAt(ecuId)
  }

  /** @inheritDoc */
  async findEcuDefinitionByAddress(
    manufacturer: string,
    model: string,
    responseAddr: string,
  ): Promise<EcuDefinition | null> {
    return this.ecus.findEcuDefinitionByAddress(manufacturer, model, responseAddr)
  }

  /** @inheritDoc */
  async upsertEcuDefinition(def: Omit<EcuDefinition, 'id' | 'createdAt'>): Promise<EcuDefinition> {
    return this.ecus.upsertEcuDefinition(def)
  }
}
