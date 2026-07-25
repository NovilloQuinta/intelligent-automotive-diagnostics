import { eq, sql } from 'drizzle-orm'
import * as schema from './schema.js'
import { Vin } from '@/domain/vin.js'
import { PidCode } from '@/domain/pidCode.js'
import type { DiagnosticsDb } from './db.js'
import type { VehicleRepositoryPort } from '@/application/ports/vehicleRepository.port.js'
import type { VehicleProfile } from '@/domain/vehicleProfile.js'
import type { DiagnosisSession } from '@/domain/diagnosisSession.js'
import type { EcuInfo } from '@/domain/ecuInfo.js'
import type { PidDefinition, PidReading } from '@/domain/pidDefinition.js'

/** Implementación de {@link VehicleRepositoryPort} con SQLite via Drizzle ORM. */
export class SqliteVehicleRepository implements VehicleRepositoryPort {
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
    const validatedVin = Vin.create(vin).value
    const rows = await this.db
      .select()
      .from(schema.vehicles)
      .where(eq(schema.vehicles.vin, validatedVin))
      .limit(1)

    if (rows.length === 0) return null

    const row = rows[0]
    return {
      id: row.id,
      vin: Vin.create(row.vin),
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
        formula: pid.formula,
        unit: pid.unit ?? null,
        dataBytes: pid.dataBytes,
        pidType: pid.pidType,
        minValue: pid.minValue ?? null,
        maxValue: pid.maxValue ?? null,
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
    vehicleId?: number,
  ): Promise<PidDefinition | null> {
    const useVehicleFilter = vehicleId !== undefined

    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(
        useVehicleFilter
          ? sql`${schema.pidDefinitions.mode} = ${mode} AND ${schema.pidDefinitions.pidCode} = ${pidCode} AND ${schema.pidDefinitions.vehicleId} = ${vehicleId}`
          : sql`${schema.pidDefinitions.mode} = ${mode} AND ${schema.pidDefinitions.pidCode} = ${pidCode}`,
      )
      .limit(1)

    if (rows.length === 0) return null

    const r = rows[0]
    return {
      id: r.id,
      vehicleId: r.vehicleId ?? undefined,
      ecuId: r.ecuId ?? undefined,
      pidCode: PidCode.create(r.mode, r.pidCode),
      name: r.name,
      description: r.description ?? undefined,
      formula: r.formula,
      unit: r.unit ?? undefined,
      dataBytes: r.dataBytes,
      pidType: r.pidType as PidDefinition['pidType'],
      minValue: r.minValue ?? undefined,
      maxValue: r.maxValue ?? undefined,
      confidence: r.confidence,
      source: r.source as PidDefinition['source'],
      createdAt: r.createdAt ?? undefined,
    }
  }

  async findPidsByVehicle(vehicleId: number): Promise<PidDefinition[]> {
    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(eq(schema.pidDefinitions.vehicleId, vehicleId))

    return rows.map((r) => ({
      id: r.id,
      vehicleId: r.vehicleId ?? undefined,
      ecuId: r.ecuId ?? undefined,
      pidCode: PidCode.create(r.mode, r.pidCode),
      name: r.name,
      description: r.description ?? undefined,
      formula: r.formula,
      unit: r.unit ?? undefined,
      dataBytes: r.dataBytes,
      pidType: r.pidType as PidDefinition['pidType'],
      minValue: r.minValue ?? undefined,
      maxValue: r.maxValue ?? undefined,
      confidence: r.confidence,
      source: r.source as PidDefinition['source'],
      createdAt: r.createdAt ?? undefined,
    }))
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
        vehicleId: session.vehicleId,
        scenarioId: session.scenarioId ?? null,
        startedAt: new Date().toISOString(),
      })
      .returning()

    return { ...session, id: result[0].id }
  }

  async endSession(sessionId: number): Promise<void> {
    await this.db
      .update(schema.diagnosisSessions)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(schema.diagnosisSessions.id, sessionId))
  }
}
