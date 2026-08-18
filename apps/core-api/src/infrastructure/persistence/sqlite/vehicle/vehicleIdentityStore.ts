import { eq } from 'drizzle-orm'
import * as schema from '../schema.js'
import { VehicleIdentity } from '@/domain/entities/vehicleIdentity.js'
import type { DiagnosticsDb } from '../db.js'

type VehicleIdentityRow = typeof schema.vehicleIdentities.$inferSelect
/** Mapea una fila de `vehicle_identities` a la entidad de dominio {@link VehicleIdentity}. */
function toVehicleIdentity(r: VehicleIdentityRow): VehicleIdentity {
  return new VehicleIdentity({
    id: r.id,
    wmi: r.wmi,
    manufacturer: r.manufacturer,
    confidence: r.confidence,
    source: r.source,
    createdAt: r.createdAt ?? undefined,
  })
}

/** Acceso a catalogo WMI -> fabricante. */
export class VehicleIdentityStore {
  constructor(private readonly db: DiagnosticsDb) {}

  async findVehicleIdentityByWmi(wmi: string): Promise<VehicleIdentity | null> {
    const rows = await this.db
      .select()
      .from(schema.vehicleIdentities)
      .where(eq(schema.vehicleIdentities.wmi, wmi.trim().toUpperCase()))
      .limit(1)

    return rows.length === 0 ? null : toVehicleIdentity(rows[0])
  }

  async upsertVehicleIdentity(
    identity: Omit<VehicleIdentity, 'id' | 'createdAt'>,
  ): Promise<VehicleIdentity> {
    // Construir la entidad primero: normaliza WMI y fabricante, y rechaza lo
    // invalido antes de tocar la BBDD.
    const candidate = new VehicleIdentity({ id: 0, ...identity })
    const existing = await this.findVehicleIdentityByWmi(candidate.wmi)

    // Nunca degradar: lo sembrado (0.9) no lo pisa un resultado de web (0.3).
    if (existing && existing.confidence >= candidate.confidence) return existing

    if (existing) {
      const updated = await this.db
        .update(schema.vehicleIdentities)
        .set({
          manufacturer: candidate.manufacturer,
          confidence: candidate.confidence,
          source: candidate.source,
        })
        .where(eq(schema.vehicleIdentities.id, existing.id))
        .returning()
      return toVehicleIdentity(updated[0])
    }

    const inserted = await this.db
      .insert(schema.vehicleIdentities)
      .values({
        wmi: candidate.wmi,
        manufacturer: candidate.manufacturer,
        confidence: candidate.confidence,
        source: candidate.source,
        createdAt: new Date().toISOString(),
      })
      .returning()
    return toVehicleIdentity(inserted[0])
  }
}
