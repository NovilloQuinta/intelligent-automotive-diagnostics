import { eq, sql, desc } from 'drizzle-orm'
import * as schema from '../schema.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
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
    // No se filtra por modelo: dentro de una marca, los modelos de la misma plataforma
    // comparten direcciones del bus, y filtrar en estricto dejaria lo aprendido en un A3
    // invisible para un A5. Se ensancha a la marca y se ordena, que es lo que ya hace
    // `pidStore.findPidDefinition`. **La marca nunca se cruza**: cada fabricante asigna
    // las suyas.
    //
    // Tres escalones, de mas fiable a menos:
    //   0. el modelo exacto
    //   1. lo declarado para toda la marca (`model = ''`), que es conocimiento deliberado
    //   2. un modelo hermano, que es una extrapolacion
    //
    // El escalon 1 gana al 2 aunque el hermano tenga mas confianza: alguien afirmo que vale
    // para la marca entera, mientras que del hermano solo estamos suponiendo.
    const rows = await this.db
      .select()
      .from(schema.ecuDefinitions)
      .where(
        sql`${schema.ecuDefinitions.manufacturer} = ${manufacturer} AND ${schema.ecuDefinitions.responseAddr} = ${normalized}`,
      )
      .orderBy(
        sql`CASE
              WHEN ${schema.ecuDefinitions.model} = ${model} THEN 0
              WHEN ${schema.ecuDefinitions.model} = '' THEN 1
              ELSE 2
            END`,
        desc(schema.ecuDefinitions.confidence),
        schema.ecuDefinitions.id,
      )
      .limit(1)

    if (rows.length === 0) return null

    return toEcuDefinition(rows[0])
  }

  /**
   * Busca la fila exacta de la clave unica `(manufacturer, model, response_addr)`.
   *
   * Existe aparte de {@link findEcuDefinitionByAddress} porque las dos consultas responden
   * preguntas distintas: aquella resuelve **que nombre mostrar** y por eso ensancha a la
   * marca para heredar entre modelos; esta decide **si insertar o actualizar** y no puede
   * ensanchar nada — si lo hiciera, indexar una definicion de marca machacaria la de un
   * modelo concreto y el catalogo se corromperia en silencio.
   */
  private async findExactEcuDefinition(
    manufacturer: string,
    model: string,
    responseAddr: string,
  ): Promise<EcuDefinition | null> {
    const rows = await this.db
      .select()
      .from(schema.ecuDefinitions)
      .where(
        sql`${schema.ecuDefinitions.manufacturer} = ${manufacturer} AND ${schema.ecuDefinitions.model} = ${model} AND ${schema.ecuDefinitions.responseAddr} = ${responseAddr.trim().toUpperCase()}`,
      )
      .limit(1)

    return rows.length === 0 ? null : toEcuDefinition(rows[0])
  }

  async upsertEcuDefinition(def: Omit<EcuDefinition, 'id' | 'createdAt'>): Promise<EcuDefinition> {
    const definition = new EcuDefinition({ id: 0, ...def })
    const existing = await this.findExactEcuDefinition(
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
      const raced = await this.findExactEcuDefinition(
        definition.manufacturer,
        definition.model,
        definition.responseAddr,
      )
      if (raced) return raced
      throw err
    }
  }
}
