import { eq, sql } from 'drizzle-orm'
import * as schema from '../schema.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { EcuDefinition } from '@/domain/entities/ecuDefinition.js'
import type { DiagnosticsDb } from '../db.js'

type EcuDefinitionRow = typeof schema.ecuDefinitions.$inferSelect
/** Mapea una fila de `ecu_definitions` a la entidad de dominio {@link EcuDefinition}. */
function toEcuDefinition(r: EcuDefinitionRow): EcuDefinition {
  return new EcuDefinition({
    id: r.id,
    manufacturer: r.manufacturer,
    model: r.model,
    responseAddr: r.responseAddr,
    requestAddr: r.requestAddr,
    name: r.name,
    type: r.type,
    system: r.system ?? undefined,
    confidence: r.confidence,
    source: r.source,
    createdAt: r.createdAt ?? undefined,
  })
}

/** Acceso a ECUs descubiertas y su catalogo por fabricante. */
export class EcuStore {
  constructor(private readonly db: DiagnosticsDb) {}

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
      // La tabla `ecus` no guarda el origen del nombre: lo aprendido vive en
      // `ecu_definitions` y se resuelve al leer, no al persistir.
      source: 'catalog' as const,
      protocol: r.protocol,
      discoveredAt: r.discoveredAt ?? undefined,
    }))
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
      // La tabla `ecus` no guarda el origen del nombre: lo aprendido vive en
      // `ecu_definitions` y se resuelve al leer, no al persistir.
      source: 'catalog' as const,
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

  async findEcuDefinitionByAddress(
    manufacturer: string,
    model: string,
    responseAddr: string,
  ): Promise<EcuDefinition | null> {
    const normalized = responseAddr.trim().toUpperCase()
    const rows = await this.db
      .select()
      .from(schema.ecuDefinitions)
      .where(
        sql`${schema.ecuDefinitions.manufacturer} = ${manufacturer} AND ${schema.ecuDefinitions.model} = ${model} AND ${schema.ecuDefinitions.responseAddr} = ${normalized}`,
      )
      .limit(1)

    if (rows.length === 0) return null

    return toEcuDefinition(rows[0])
  }

  async upsertEcuDefinition(def: Omit<EcuDefinition, 'id' | 'createdAt'>): Promise<EcuDefinition> {
    const definition = new EcuDefinition({ id: 0, ...def })
    const existing = await this.findEcuDefinitionByAddress(
      definition.manufacturer,
      definition.model,
      definition.responseAddr,
    )
    if (existing) {
      const updated = await this.db
        .update(schema.ecuDefinitions)
        .set({
          requestAddr: definition.requestAddr,
          name: definition.name,
          type: definition.type,
          system: definition.system ?? null,
          confidence: definition.confidence,
          source: definition.source,
        })
        .where(eq(schema.ecuDefinitions.id, existing.id))
        .returning()
      return toEcuDefinition(updated[0])
    }

    try {
      const result = await this.db
        .insert(schema.ecuDefinitions)
        .values({
          manufacturer: definition.manufacturer,
          model: definition.model,
          responseAddr: definition.responseAddr,
          requestAddr: definition.requestAddr,
          name: definition.name,
          type: definition.type,
          system: definition.system ?? null,
          confidence: definition.confidence,
          source: definition.source,
          createdAt: new Date().toISOString(),
        })
        .returning()
      return toEcuDefinition(result[0])
    } catch (err) {
      // Carrera con un insert concurrente de la misma clave única
      // (manufacturer + model + response_addr): re-consultar y devolver la fila ganadora.
      const raced = await this.findEcuDefinitionByAddress(
        definition.manufacturer,
        definition.model,
        definition.responseAddr,
      )
      if (raced) return raced
      throw err
    }
  }
}
