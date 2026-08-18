import { eq, sql, desc } from 'drizzle-orm'
import * as schema from '../schema.js'
import { Formula } from '@/domain/value-objects/formula.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'
import type { PidDefinition } from '@/domain/entities/pidDefinition.js'
import type { PidReading } from '@/domain/entities/pidReading.js'
import type { DiagnosticsDb } from '../db.js'

type PidDefinitionRow = typeof schema.pidDefinitions.$inferSelect
/** Mapea una fila de `pid_definitions` a la entidad de dominio {@link PidDefinition}. */
function toPidDefinition(r: PidDefinitionRow): PidDefinition {
  return {
    id: r.id,
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
    system: r.system ?? undefined,
    confidence: r.confidence,
    source: r.source as PidDefinition['source'],
    createdAt: r.createdAt ?? undefined,
  }
}

/** Acceso a catalogo de PIDs y lecturas historicas. */
export class PidStore {
  constructor(private readonly db: DiagnosticsDb) {}

  async insertPidDefinition(pid: PidDefinition): Promise<PidDefinition> {
    const result = await this.db
      .insert(schema.pidDefinitions)
      .values({
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
        system: pid.system ?? null,
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

  async findPidsByManufacturerModel(manufacturer: string, model: string): Promise<PidDefinition[]> {
    const scopeManufacturer = manufacturer ?? ''
    const scopeModel = model ?? ''

    const rows = await this.db
      .select()
      .from(schema.pidDefinitions)
      .where(
        sql`(${schema.pidDefinitions.manufacturer} = ${scopeManufacturer} AND ${schema.pidDefinitions.model} = ${scopeModel}) OR (${schema.pidDefinitions.manufacturer} = '' AND ${schema.pidDefinitions.model} = '')`,
      )
      .orderBy(desc(schema.pidDefinitions.confidence), schema.pidDefinitions.id)

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
        mode: reading.mode,
        pidCode: reading.pidCode,
        rawHex: reading.rawHex,
        parsedValue: reading.parsedValue ?? null,
        timestamp: new Date().toISOString(),
      })
      .returning()

    return { ...reading, id: result[0].id }
  }
}
