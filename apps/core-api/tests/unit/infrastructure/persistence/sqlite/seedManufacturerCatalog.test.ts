import { describe, it, expect, vi, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { seedManufacturerCatalog } from '@/infrastructure/persistence/sqlite/seedManufacturerCatalog.js'
import { PidDefinition } from '@/domain/entities/PidDefinition.js'
import { PidCode } from '@/domain/value-objects/PidCode.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

const DDL = `
  CREATE TABLE IF NOT EXISTS pid_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    pid_code TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    formula TEXT NOT NULL,
    unit TEXT,
    data_bytes INTEGER NOT NULL DEFAULT 1,
    pid_type TEXT NOT NULL DEFAULT 'formula',
    min_value REAL,
    max_value REAL,
    manufacturer TEXT,
    model TEXT,
    system TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS pid_definitions_mode_pid_manufacturer_model_unique
    ON pid_definitions (mode, pid_code, manufacturer, model);

  CREATE TABLE IF NOT EXISTS dtc_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    confidence REAL NOT NULL DEFAULT 0.5,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(manufacturer, model, code)
  );

  CREATE TABLE IF NOT EXISTS vehicle_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wmi TEXT NOT NULL UNIQUE,
    manufacturer TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.3,
    source TEXT NOT NULL DEFAULT 'web',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`

describe('seedManufacturerCatalog', () => {
  let db: ReturnType<typeof drizzle>
  let repo: SqliteVehicleRepository
  let logger: LoggerPort

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.exec(DDL)
    db = drizzle(sqlite, { schema })
    repo = new SqliteVehicleRepository(db)
    logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  })

  it('seeds 20 Mode 22 PIDs and 23 manufacturer-specific DTCs', async () => {
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    expect(mode22).toHaveLength(20)

    const dtcs = await db.select().from(schema.dtcDefinitions)
    expect(dtcs).toHaveLength(23)
  })

  it('is idempotent: running twice does not duplicate rows', async () => {
    await seedManufacturerCatalog(repo, logger)
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    expect(mode22).toHaveLength(20)

    const dtcs = await db.select().from(schema.dtcDefinitions)
    expect(dtcs).toHaveLength(23)
  })

  it('marks seeded data with source "seed" and correct manufacturer/model', async () => {
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    expect(mode22.every((p) => p.source === 'seed')).toBe(true)

    const toyota = mode22.filter((p) => p.manufacturer === 'Toyota')
    expect(toyota).toHaveLength(4)
    expect(toyota.every((p) => p.model === 'Auris Hybrid')).toBe(true)

    const audi = mode22.filter((p) => p.manufacturer === 'Audi')
    expect(audi).toHaveLength(16)
    expect(audi.every((p) => p.model === 'A3')).toBe(true)
  })

  it('DB unique index rejects duplicate (mode, pid_code, manufacturer, model)', async () => {
    const pid = new PidDefinition({
      id: 0,
      pidCode: new PidCode('22', 'F00F'),
      name: 'Test DID',
      formula: 'A',
      dataBytes: 1,
      pidType: 'formula',
      confidence: 1.0,
      source: 'seed',
      manufacturer: 'Audi',
      model: 'A3',
    })

    await repo.insertPidDefinition(pid)

    await expect(repo.insertPidDefinition(pid)).rejects.toThrow()
  })

  it('seed PIDs carry maxValue coherent with their formula', async () => {
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    const byPid = new Map(mode22.map((p) => [p.pidCode.pid, p]))

    // 1 byte con formula 'A' → max 255
    expect(byPid.get('F430')!.maxValue).toBe(255)
    expect(byPid.get('F432')!.maxValue).toBe(255)
    expect(byPid.get('1035')!.maxValue).toBe(255)
    expect(byPid.get('F449')!.maxValue).toBe(255)
    expect(byPid.get('F40D')!.maxValue).toBe(255)

    // (A*256+B)/4 → max 16383.75
    expect(byPid.get('1130')!.maxValue).toBe(16383.75)

    // (A*256+B)*0.01 o /100 → max 655.35
    expect(byPid.get('F477')!.maxValue).toBe(655.35)
    expect(byPid.get('1132')!.maxValue).toBe(655.35)
    expect(byPid.get('1410')!.maxValue).toBe(655.35)
    expect(byPid.get('1462')!.maxValue).toBe(655.35)
  })

  it('labels each seeded Mode 22 PID with its system', async () => {
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    const byPid = new Map(mode22.map((p) => [p.pidCode.pid, p]))

    expect(byPid.get('0300')!.system).toBe('Transmission') // TCU Odometer
    expect(byPid.get('0400')!.system).toBe('Engine') // ECM Odometer
    expect(byPid.get('7A76')!.system).toBe('Battery') // Hybrid Battery SoC
    expect(byPid.get('1410')!.system).toBe('Exhaust') // DPF Soot Mass
    expect(byPid.get('1035')!.system).toBe('Emissions') // EGR Duty Cycle
    expect(byPid.get('F40D')!.system).toBe('Vehicle') // Vehicle Speed
  })

  it('assigns a system label to every seeded Mode 22 PID', async () => {
    await seedManufacturerCatalog(repo, logger)

    const mode22 = await repo.findPidsByMode('22')
    const labeled = mode22.filter((p) => p.system !== undefined && p.system !== '')
    expect(labeled).toHaveLength(20)
  })

  describe('identidades WMI', () => {
    // Cobertura heredada de `Vin.manufacturer`, que era una tabla en codigo:
    // las mismas marcas, ahora comprobadas en su sitio nuevo.
    it.each([
      ['WAUZZZ8V5JA123456', 'Audi'],
      ['WVWZZZ1JZXW123456', 'Volkswagen'],
      ['WBA3B5C50J1234567', 'BMW'],
      ['WDDGF4HB3CR123456', 'Mercedes-Benz'],
      ['WP0ZZZ99ZTS390000', 'Porsche'],
      ['VF3XXXXXXXX123456', 'Peugeot'],
      ['JKAZR2A1XLA000111', 'Kawasaki'],
      ['JTDKB20EX20012345', 'Toyota'],
      ['JHMCM56557C404321', 'Honda'],
      ['WF0MXXGCM5X123456', 'Ford'],
      ['1G1BC52E5P7123456', 'Chevrolet'],
    ])('resuelve el fabricante de %s', async (vin, expected) => {
      await seedManufacturerCatalog(repo, logger)

      const identity = await repo.findVehicleIdentityByWmi(vin.slice(0, 3))

      expect(identity).not.toBeNull()
      expect(identity!.manufacturer).toBe(expected)
      expect(identity!.source).toBe('seed')
    })

    it('no conoce un WMI que no esta sembrado: lo resolvera la cascada', async () => {
      await seedManufacturerCatalog(repo, logger)

      // VR3 es el WMI de los Peugeot recientes de Stellantis, y es justo el caso
      // que se registraba como `unknown` con la tabla en codigo.
      expect(await repo.findVehicleIdentityByWmi('VR3')).toBeNull()
      expect(await repo.findVehicleIdentityByWmi('XTA')).toBeNull()
    })

    it('re-sembrar no pisa lo que la cascada haya aprendido con mas confianza', async () => {
      await seedManufacturerCatalog(repo, logger)
      await repo.upsertVehicleIdentity({
        wmi: 'VR3',
        manufacturer: 'Peugeot',
        confidence: 0.3,
        source: 'web',
      })

      await seedManufacturerCatalog(repo, logger)

      const learned = await repo.findVehicleIdentityByWmi('VR3')
      expect(learned!.manufacturer).toBe('Peugeot')
      expect(learned!.source).toBe('web')
    })
  })
})
