import { eq, sql, desc } from 'drizzle-orm'
import * as schema from '../schema.js'
import type { DtcDefinition } from '@/domain/entities/DtcDefinition.js'
import type { DiagnosticsDb } from '../db.js'

type DtcDefinitionRow = typeof schema.dtcDefinitions.$inferSelect
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

/** Acceso a catalogo auto-expansivo de DTCs. */
export class DtcStore {
  constructor(private readonly db: DiagnosticsDb) {}

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
}
