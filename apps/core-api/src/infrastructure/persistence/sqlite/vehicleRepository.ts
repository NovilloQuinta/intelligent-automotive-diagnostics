import { eq, and, sql, desc, gte, lte, count } from 'drizzle-orm'
import * as schema from './schema.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { Formula } from '@/domain/value-objects/formula.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'
import type { DiagnosticsDb } from './db.js'
import type {
  VehicleRepository,
  DiagnosisSessionFilter,
  DiagnosisSessionPage,
} from '@/application/ports/VehicleRepository.js'
import type { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import { DiagnosisSession } from '@/domain/entities/diagnosisSession.js'
import type { SessionSeverity } from '@/domain/entities/diagnosisSession.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import type { PidReading } from '@/domain/entities/pidReading.js'
import type { DtcDefinition } from '@/domain/entities/dtcDefinition.js'

type PidDefinitionRow = typeof schema.pidDefinitions.$inferSelect
type DtcDefinitionRow = typeof schema.dtcDefinitions.$inferSelect

/** Mapea una fila de `pid_definitions` a la entidad de dominio {@link PidDefinition}. */
function toPidDefinition(r: PidDefinitionRow): PidDefinition {
  return {
    id: r.id,
    vehicleId: r.vehicleId ?? undefined,
    ecuId: r.ecuId ?? undefined,
    pidCode: new PidCode(r.mode, r.pidCode),
    name: r.name,
    description: r.description ?? undefined,
    formula: new Formula(r.formula),
    unit: r.unit ?? undefined,
    dataBytes: r.dataBytes,
    pidType: r.pidType as PidDefinition['pidType'],
    minValue: r.minValue ?? undefined,
    maxValue: r.maxValue ?? undefined,
    manufacturer: r.manufacturer || undefined,
    model: r.model || undefined,
    confidence: r.confidence,
    source: r.source as PidDefinition['source'],
    createdAt: r.createdAt ?? undefined,
  }
}

/** Mapea una fila de `dtc_definitions` a la entidad de dominio {@link DtcDefinition}. */
function toDtcDefinition(r: DtcDefinitionRow): DtcDefinition {
  return {
    id: r.id,
    manufacturer: r.manufacturer,
    model: r.model,
    code: r.code,
    description: r.description ?? undefined,
    confidence: r.confidence,
    source: r.source,
    createdAt: r.createdAt ?? undefined,
  }
}

/** Implementación de {@link VehicleRepository} con SQLite via Drizzle ORM. */
export class SqliteVehicleRepository implements VehicleRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async upsertVehicle(profile: VehicleProfile): Promise<VehicleProfile> {
    const vin = profile.vin.value
    const existing = await this.findVehicleByVin(vin)

    if (existing?.id) {
      await this.db
        .update(schema.vehicles)
        .set({
          make: profile.make,
          model: profile.model,
          year: profile.year,
          engineType: profile.engineType,
          lastSeen: new Date().toISOString(),
        })
        .where(eq(schema.vehicles.id, existing.id))

      return { ...existing, ...profile, id: existing.id }
    }

    const result = await this.db
      .insert(schema.vehicles)
      .values({
        vin,
        make: profile.make,
        model: profile.model,
        year: profile.year,
        engineType: profile.engineType,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
      })
      .returning()

    return { ...profile, id: result[0].id }
  }

  async findVehicleByVin(vin: string): Promise<VehicleProfile | null> {
    const validatedVin = new Vin(vin).value
    const rows = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.vin, validatedVin))
      .limit(1)

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      id: row.id,
      vin: new Vin(row.vin),
      make: row.make,
      model: row.model,
      year: row.year,
      engineType: row.engineType,
      firstSeen: row.firstSeen ?? undefined,
      lastSeen: row.lastSeen ?? undefined,
    }
  }

  async insertEcu(ecu: EcuInfo): Promise<EcuInfo> {
    const result = await this.db
      .insert(schema.ecus)
      .values({
        vehicleId: ecu.vehicleId,
        name: ecu.name,
        requestAddr: ecu.requestAddr,
        responseAddr: ecu.responseAddr,
        type: ecu.type,
        protocol: ecu.protocol,
        discoveredAt: new Date().toISOString(),
      })
      .returning()

    return { ...ecu, id: result[0].id }
  }

  async findEcusByVehicle(vehicleId: number): Promise<EcuInfo[]> {
    const rows = await this.db
      .select()
      .from(schema.ecus)
      .where(eq(schema.ecus.vehicleId, vehicleId))

    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId,
      name: r.name,
      requestAddr: r.requestAddr,
      responseAddr: r.responseAddr,
      type: r.type as EcuInfo['type'],
      protocol: r.protocol,
      discoveredAt: r.discoveredAt ?? undefined,
    }))
  }

  async insertPidDefinition(pid: PidDefinition): Promise<PidDefinition> {
    const result = await this.db
      .insert(schema.pidDefinitions)
      .values({
        vehicleId: pid.vehicleId ?? null,
        ecuId: pid.ecuId ?? null,
        mode: pid.pidCode.mode,
        pidCode: pid.pidCode.pid,
        name: pid.name,
        description: pid.description ?? null,
        formula: pid.formula.toString(),
        unit: pid.unit ?? null,
        dataBytes: pid.dataBytes,
        pidType: pid.pidType,
        minValue: pid.minValue ?? null,
        maxValue: pid.maxValue ?? null,
        manufacturer: pid.manufacturer ?? '',
        model: pid.model ?? '',
        confidence: pid.confidence,
        source: pid.source,
        createdAt: new Date().toISOString(),
      })
      .returning()

    return { ...pid, id: result[0].id }
  }

  async findPidDefinition(
    mode: string,
    pidCode: string,
    manufacturer?: string,
    model?: string,
  ): Promise<PidDefinition | null> {
    const useManufacturerFilter = manufacturer !== undefined && manufacturer !== ''
    const useModelFilter = model !== undefined && model !== ''

    let conditions = sql`${schema.pidDefinitions.mode} = ${mode} AND ${schema.pidDefinitions.pidCode} = ${pidCode}`

    if (useManufacturerFilter) {
      conditions = sql`${conditions} AND ${schema.pidDefinitions.manufacturer} = ${manufacturer}`
    }
    if (useModelFilter) {
      conditions = sql`${conditions} AND ${schema.pidDefinitions.model} = ${model}`
    }

    // Orden determinista: prioriza las definiciones de mayor confianza (las seed
    // 0.9-1.0 ganan a los placeholders 'auto' 0.3) y, a igual confianza, la más antigua.
    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(conditions)
      .orderBy(desc(schema.pidDefinitions.confidence), schema.pidDefinitions.id)
      .limit(1)

    if (rows.length === 0) return null

    return toPidDefinition(rows[0])
  }

  async findPidsByVehicle(vehicleId: number): Promise<PidDefinition[]> {
    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(eq(schema.pidDefinitions.vehicleId, vehicleId))

    return rows.map((r) => toPidDefinition(r))
  }

  async findPidsByMode(mode: string): Promise<PidDefinition[]> {
    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(eq(schema.pidDefinitions.mode, mode))

    return rows.map((r) => toPidDefinition(r))
  }

  async insertPidReading(reading: PidReading): Promise<PidReading> {
    const result = await this.db
      .insert(schema.pidReadings)
      .values({
        pidDefId: reading.pidDefId ?? null,
        sessionId: reading.sessionId,
        rawHex: reading.rawHex,
        parsedValue: reading.parsedValue ?? null,
        timestamp: new Date().toISOString(),
      })
      .returning()

    return { ...reading, id: result[0].id }
  }

  async createSession(session: DiagnosisSession): Promise<DiagnosisSession> {
    const result = await this.db
      .insert(schema.diagnosisSessions)
      .values({
        vehicleId: session.vehicleId as number | null,
        userId: session.userId as number | null,
        scenarioId: session.scenarioId ?? null,
        startedAt: new Date().toISOString(),
      })
      .returning()

    return new DiagnosisSession({
      id: result[0].id,
      vehicleId: session.vehicleId,
      userId: session.userId,
      scenarioId: session.scenarioId,
      startedAt: new Date().toISOString(),
    })
  }

  async endSession(
    sessionId: number,
    result?: { resultJson: string; severity: SessionSeverity; dtcCount: number },
  ): Promise<void> {
    const updates: Partial<typeof schema.diagnosisSessions.$inferInsert> = {
      endedAt: new Date().toISOString(),
    }
    if (result) {
      updates.resultJson = result.resultJson
      updates.severity = result.severity
      updates.dtcCount = result.dtcCount
    }
    await this.db
      .update(schema.diagnosisSessions)
      .set(updates)
      .where(eq(schema.diagnosisSessions.id, sessionId))
  }

  async findSessions(filter: DiagnosisSessionFilter): Promise<DiagnosisSessionPage> {
    const conditions: ReturnType<typeof and>[] = [
      eq(schema.diagnosisSessions.userId, filter.userId),
    ]

    if (filter.from) {
      conditions.push(gte(schema.diagnosisSessions.startedAt, filter.from))
    }
    if (filter.to) {
      conditions.push(lte(schema.diagnosisSessions.startedAt, filter.to))
    }
    if (filter.scenarioId) {
      conditions.push(eq(schema.diagnosisSessions.scenarioId, filter.scenarioId))
    }
    if (filter.severity) {
      conditions.push(eq(schema.diagnosisSessions.severity, filter.severity))
    }

    const where = and(...conditions)

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(schema.diagnosisSessions)
        .where(where)
        .orderBy(desc(schema.diagnosisSessions.startedAt))
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ total: count() }).from(schema.diagnosisSessions).where(where),
    ])

    return {
      items: items.map(
        (r) =>
          new DiagnosisSession({
            id: r.id,
            vehicleId: r.vehicleId,
            userId: r.userId,
            scenarioId: r.scenarioId ?? undefined,
            startedAt: r.startedAt,
            endedAt: r.endedAt ?? undefined,
            resultJson: r.resultJson ?? undefined,
            severity: (r.severity as SessionSeverity) ?? undefined,
            dtcCount: r.dtcCount ?? undefined,
          }),
      ),
      total: totalResult[0]?.total ?? 0,
    }
  }

  async findSessionById(id: number, userId: number): Promise<DiagnosisSession | null> {
    const rows = await this.db
      .select()
      .from(schema.diagnosisSessions)
      .where(and(eq(schema.diagnosisSessions.id, id), eq(schema.diagnosisSessions.userId, userId)))
      .limit(1)

    if (rows.length === 0) return null

    const r = rows[0]
    return new DiagnosisSession({
      id: r.id,
      vehicleId: r.vehicleId,
      userId: r.userId,
      scenarioId: r.scenarioId ?? undefined,
      startedAt: r.startedAt,
      endedAt: r.endedAt ?? undefined,
      resultJson: r.resultJson ?? undefined,
      severity: (r.severity as SessionSeverity) ?? undefined,
      dtcCount: r.dtcCount ?? undefined,
    })
  }

  async findDtcDefinition(
    manufacturer: string,
    model: string,
    code: string,
  ): Promise<DtcDefinition | null> {
    const rows = await this.db
      .select()
      .from(schema.dtcDefinitions)
      .where(
        sql`${schema.dtcDefinitions.manufacturer} = ${manufacturer} AND ${schema.dtcDefinitions.model} = ${model} AND ${schema.dtcDefinitions.code} = ${code}`,
      )
      .limit(1)

    if (rows.length === 0) return null

    return toDtcDefinition(rows[0])
  }

  async findDtcDefinitionByCode(code: string): Promise<DtcDefinition | null> {
    const rows = await this.db
      .select()
      .from(schema.dtcDefinitions)
      .where(eq(schema.dtcDefinitions.code, code))
      .orderBy(desc(schema.dtcDefinitions.confidence), schema.dtcDefinitions.id)
      .limit(1)

    if (rows.length === 0) return null

    return toDtcDefinition(rows[0])
  }

  async upsertDtcDefinition(dtc: Omit<DtcDefinition, 'id' | 'createdAt'>): Promise<DtcDefinition> {
    const existing = await this.findDtcDefinition(dtc.manufacturer, dtc.model, dtc.code)
    if (existing) {
      const updated = await this.db
        .update(schema.dtcDefinitions)
        .set({
          description: dtc.description ?? null,
          confidence: dtc.confidence,
          source: dtc.source,
        })
        .where(eq(schema.dtcDefinitions.id, existing.id))
        .returning()
      return toDtcDefinition(updated[0])
    }

    try {
      const result = await this.db
        .insert(schema.dtcDefinitions)
        .values({
          manufacturer: dtc.manufacturer,
          model: dtc.model,
          code: dtc.code,
          description: dtc.description ?? null,
          confidence: dtc.confidence,
          source: dtc.source,
          createdAt: new Date().toISOString(),
        })
        .returning()
      return toDtcDefinition(result[0])
    } catch (err) {
      // Carrera con un insert concurrente de la misma clave única
      // (manufacturer + model + code): re-consultar y devolver la fila ganadora.
      const raced = await this.findDtcDefinition(dtc.manufacturer, dtc.model, dtc.code)
      if (raced) return raced
      throw err
    }
  }

  async findEcuByAddress(
    vehicleId: number,
    requestAddr: string,
    responseAddr: string,
  ): Promise<EcuInfo | null> {
    const rows = await this.db
      .select()
      .from(schema.ecus)
      .where(
        sql`${schema.ecus.vehicleId} = ${vehicleId} AND ${schema.ecus.requestAddr} = ${requestAddr} AND ${schema.ecus.responseAddr} = ${responseAddr}`,
      )
      .limit(1)

    if (rows.length === 0) return null

    const r = rows[0]
    return {
      id: r.id,
      vehicleId: r.vehicleId,
      name: r.name,
      requestAddr: r.requestAddr,
      responseAddr: r.responseAddr,
      type: r.type as EcuInfo['type'],
      protocol: r.protocol,
      discoveredAt: r.discoveredAt ?? undefined,
    }
  }

  async updateEcuDiscoveredAt(ecuId: number): Promise<void> {
    await this.db
      .update(schema.ecus)
      .set({ discoveredAt: new Date().toISOString() })
      .where(eq(schema.ecus.id, ecuId))
  }
}
