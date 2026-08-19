import { eq } from 'drizzle-orm'
import * as schema from '../schema.js'
import { Vin } from '@/domain/value-objects/Vin.js'
import type { VehicleProfile } from '@/domain/entities/VehicleProfile.js'
import type { DiagnosticsDb } from '../db.js'

/** Acceso a vehiculos por VIN. */
export class VehicleStore {
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
}
