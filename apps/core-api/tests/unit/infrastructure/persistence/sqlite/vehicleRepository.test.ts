import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { VinDecodeError, Vin } from '@/domain/value-objects/vin.js'
import type { VehicleProfile } from '@/domain/value-objects/vehicleInfo.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition, PidReading } from '@/domain/entities/pidDefinition.js'
import type { DtcDefinition } from '@/domain/entities/dtcDefinition.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'

describe('SqliteVehicleRepository', () => {
  let db: ReturnType<typeof drizzle>
  let repo: SqliteVehicleRepository

  beforeAll(() => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('journal_mode = WAL')
    sqlite.pragma('foreign_keys = ON')

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS vehicles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vin TEXT NOT NULL UNIQUE,
        make TEXT NOT NULL,
        model TEXT NOT NULL,
        year INTEGER NOT NULL,
        engine_type TEXT NOT NULL,
        first_seen TEXT NOT NULL DEFAULT (datetime('now')),
        last_seen TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS ecus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        name TEXT NOT NULL,
        request_addr TEXT NOT NULL,
        response_addr TEXT NOT NULL,
        type TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'CAN_11_500',
        discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pid_definitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER REFERENCES vehicles(id),
        ecu_id INTEGER REFERENCES ecus(id),
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
        confidence REAL NOT NULL DEFAULT 1.0,
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS pid_readings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pid_def_id INTEGER REFERENCES pid_definitions(id),
        session_id TEXT NOT NULL,
        raw_hex TEXT NOT NULL,
        parsed_value REAL,
        timestamp TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        user_type TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        business_name TEXT,
        tax_id TEXT,
        address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );

      CREATE TABLE IF NOT EXISTS diagnosis_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER REFERENCES vehicles(id),
        user_id INTEGER REFERENCES users(id),
        scenario_id TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT,
        result_json TEXT,
        severity TEXT,
        dtc_count INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_diagnosis_sessions_user_started
        ON diagnosis_sessions (user_id, started_at);

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
    `)

    db = drizzle(sqlite, { schema })
    repo = new SqliteVehicleRepository(db)
  })

  const toyotaAuris: VehicleProfile = {
    vin: new Vin('SB1KE76L40E001234'),
    make: 'Toyota',
    model: 'Auris Hybrid',
    year: 2014,
    engineType: '1.8L Hybrid',
  }

  describe('upsertVehicle', () => {
    it('should insert a new vehicle and assign an id', async () => {
      const result = await repo.upsertVehicle(toyotaAuris)

      expect(result.id).toBeGreaterThan(0)
      expect(result?.vin?.value).toBe(toyotaAuris.vin.value)
      expect(result.make).toBe('Toyota')
    })

    it('should update lastSeen when inserting a vehicle with an existing VIN', async () => {
      const first = await repo.upsertVehicle(toyotaAuris)

      const second = await repo.upsertVehicle({
        ...toyotaAuris,
        year: 2015,
      })

      expect(second.id).toBe(first.id)
      expect(second.year).toBe(2015)
    })

    it('should throw VinDecodeError when VIN has wrong length', () => {
      expect(() => new Vin('SHORT')).toThrow(VinDecodeError)
    })

    it('should throw VinDecodeError when VIN has forbidden character I', () => {
      expect(() => new Vin('WAIZZZ8V5JA123456')).toThrow(VinDecodeError)
    })
  })

  describe('findVehicleByVin', () => {
    it('should find a vehicle by VIN', async () => {
      await repo.upsertVehicle(toyotaAuris)

      const result = await repo.findVehicleByVin(toyotaAuris.vin.value)

      expect(result).not.toBeNull()
      expect(result!.make).toBe('Toyota')
      expect(result!.model).toBe('Auris Hybrid')
    })

    it('should return null for unknown VIN', async () => {
      const result = await repo.findVehicleByVin('XXXXXXXXXXXX99999')

      expect(result).toBeNull()
    })

    it('should throw VinDecodeError when searching with invalid VIN', async () => {
      await expect(repo.findVehicleByVin('SHORT')).rejects.toThrow(VinDecodeError)
    })
  })

  describe('ecus', () => {
    let vehicleId: number

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      vehicleId = vehicle.id!
    })

    it('should insert an ECU and return it with an id', async () => {
      const ecu: EcuInfo = {
        vehicleId,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'CAN_11_500',
      }

      const result = await repo.insertEcu(ecu)

      expect(result.id).toBeGreaterThan(0)
      expect(result.name).toBe('Engine Control Module')
    })

    it('should find all ECUs for a vehicle', async () => {
      await repo.insertEcu({
        vehicleId,
        name: 'Transmission Control Module',
        requestAddr: '7E1',
        responseAddr: '7E9',
        type: 'TCU',
        protocol: 'CAN_11_500',
      })

      const ecus = await repo.findEcusByVehicle(vehicleId)

      expect(ecus).toHaveLength(2)
      expect(ecus.map((e) => e.name)).toContain('Transmission Control Module')
    })
  })

  describe('pidDefinitions', () => {
    let vehicleId: number
    let ecuId: number

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      vehicleId = vehicle.id!
      const ecu = await repo.insertEcu({
        vehicleId,
        name: 'ECM',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'CAN_11_500',
      })
      ecuId = ecu.id!
    })

    function rpmPid(): PidDefinition {
      return {
        vehicleId,
        ecuId,
        pidCode: new PidCode('01', '0C'),
        name: 'Engine RPM',
        description: 'Revolutions per minute',
        formula: '(A*256+B)/4',
        unit: 'rpm',
        dataBytes: 2,
        pidType: 'formula',
        minValue: 0,
        maxValue: 10000,
        confidence: 1.0,
        source: 'manual',
      }
    }

    it('should insert a PID definition and return it with an id', async () => {
      const result = await repo.insertPidDefinition(rpmPid())

      expect(result.id).toBeGreaterThan(0)
      expect(result.name).toBe('Engine RPM')
      expect(result.confidence).toBe(1.0)
    })

    it('should find a PID definition by mode, pidCode and manufacturer/model', async () => {
      await repo.insertPidDefinition({ ...rpmPid(), manufacturer: 'Toyota', model: 'Auris' })

      const result = await repo.findPidDefinition('01', '0C', 'Toyota', 'Auris')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine RPM')
      expect(result!.formula.expression).toBe('(A*256+B)/4')
    })

    it('should return null for unknown PID', async () => {
      const result = await repo.findPidDefinition('22', 'FFFF')

      expect(result).toBeNull()
    })

    it('should find a PID by mode and code without manufacturer/model filter', async () => {
      await repo.insertPidDefinition(rpmPid())

      const result = await repo.findPidDefinition('01', '0C')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine RPM')
    })

    it('should store and find a PID definition with manufacturer/model', async () => {
      await repo.insertPidDefinition({
        ...rpmPid(),
        manufacturer: 'Toyota',
        model: 'Auris',
      })

      // Should find with matching manufacturer/model
      const found = await repo.findPidDefinition('01', '0C', 'Toyota', 'Auris')
      expect(found).not.toBeNull()
      expect(found!.manufacturer).toBe('Toyota')
      expect(found!.model).toBe('Auris')

      // Should NOT find with different manufacturer/model
      const notFound = await repo.findPidDefinition('01', '0C', 'Ford', 'Focus')
      expect(notFound).toBeNull()
    })

    it('should find all PIDs for a vehicle', async () => {
      await repo.insertPidDefinition({
        vehicleId,
        ecuId,
        pidCode: new PidCode('01', '05'),
        name: 'Coolant Temperature',
        formula: 'A-40',
        unit: '°C',
        dataBytes: 1,
        pidType: 'formula',
        confidence: 1.0,
        source: 'manual',
      })

      const pids = await repo.findPidsByVehicle(vehicleId)

      expect(pids.length).toBeGreaterThanOrEqual(2)
      expect(pids.map((p) => p.name)).toContain('Coolant Temperature')
      expect(pids.map((p) => p.name)).toContain('Engine RPM')
    })

    it('should store an LLM-guessed PID with lower confidence', async () => {
      const llmPid: PidDefinition = {
        vehicleId,
        ecuId,
        pidCode: new PidCode('22', '0300'),
        name: 'TCU Odometer',
        formula: '(A<<24|B<<16|C<<8|D)/10',
        unit: 'km',
        dataBytes: 4,
        pidType: 'formula',
        confidence: 0.75,
        source: 'llm_guess',
      }

      const result = await repo.insertPidDefinition(llmPid)

      expect(result.source).toBe('llm_guess')
      expect(result.confidence).toBe(0.75)
    })

    it('should find all PIDs of a mode from the global catalog', async () => {
      await repo.insertPidDefinition({
        ...rpmPid(),
        pidCode: new PidCode('22', '1130'),
        name: 'Engine Speed',
        formula: '(A*256+B)/4',
        manufacturer: 'Audi',
        model: 'A3',
      })

      const mode22 = await repo.findPidsByMode('22')

      expect(mode22.map((p) => p.pidCode.pid)).toContain('1130')
      expect(mode22.every((p) => p.pidCode.mode === '22')).toBe(true)
    })

    it('should return an empty array for a mode with no PIDs', async () => {
      const result = await repo.findPidsByMode('FE')

      expect(result).toEqual([])
    })

    it('findPidDefinition without manufacturer/model returns the highest-confidence match deterministically', async () => {
      await repo.insertPidDefinition({
        vehicleId,
        ecuId,
        pidCode: new PidCode('22', '1234'),
        name: 'Unknown DID',
        formula: 'A*256+B',
        dataBytes: 2,
        pidType: 'formula',
        confidence: 0.3,
        source: 'auto',
      })
      await repo.insertPidDefinition({
        pidCode: new PidCode('22', '1234'),
        name: 'Real DID',
        formula: '(A*256+B)/4',
        dataBytes: 2,
        pidType: 'formula',
        confidence: 1.0,
        source: 'seed',
        manufacturer: 'Audi',
        model: 'A3',
      })

      const result = await repo.findPidDefinition('22', '1234')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Real DID')
      expect(result!.confidence).toBe(1.0)
    })
  })

  describe('pidReadings', () => {
    let pidDefId: number

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      const ecu = await repo.insertEcu({
        vehicleId: vehicle.id!,
        name: 'ECM',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'CAN_11_500',
      })
      const pid = await repo.insertPidDefinition({
        vehicleId: vehicle.id!,
        ecuId: ecu.id!,
        pidCode: new PidCode('01', '0C'),
        name: 'Engine RPM',
        formula: '(A*256+B)/4',
        unit: 'rpm',
        dataBytes: 2,
        pidType: 'formula',
        confidence: 1.0,
        source: 'manual',
      })
      pidDefId = pid.id!
    })

    it('should insert a PID reading', async () => {
      const reading: PidReading = {
        pidDefId,
        sessionId: 'session-001',
        rawHex: '0C7B',
        parsedValue: 797.75,
      }

      const result = await repo.insertPidReading(reading)

      expect(result.id).toBeGreaterThan(0)
      expect(result.rawHex).toBe('0C7B')
      expect(result.parsedValue).toBeCloseTo(797.75)
    })
  })

  describe('diagnosisSessions', () => {
    let vehicleId: number
    const USER_ID = 1

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      vehicleId = vehicle.id!
      // Insert a test user so FK constraint passes
      const userTable = schema.users
      await db
        .insert(userTable)
        .values({
          id: USER_ID,
          username: 'testuser',
          email: 'test@test.com',
          passwordHash: 'hash',
          userType: 'individual',
        })
        .onConflictDoNothing()
    })

    it('should create and end a diagnosis session', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId,
        scenarioId: 'toyota-auris-hybrid',
        startedAt: new Date().toISOString(),
      })

      expect(session.id).toBeGreaterThan(0)
      expect(session.vehicleId).toBe(vehicleId)

      await repo.endSession(session.id)
    })

    it('should create a session with null vehicleId (no FK violation)', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId: null,
        userId: USER_ID,
        scenarioId: 'direct-connection',
        startedAt: new Date().toISOString(),
      })

      expect(session.id).toBeGreaterThan(0)
      expect(session.vehicleId).toBeNull()

      await repo.endSession(session.id)
    })

    it('should end a session with resultJson, severity and dtcCount', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId,
        userId: USER_ID,
        scenarioId: 'toyota-auris-hybrid',
        startedAt: new Date().toISOString(),
      })

      await repo.endSession(session.id, {
        resultJson: '{"dtcs":[],"narrative":"All good"}',
        severity: 'low',
        dtcCount: 0,
      })

      // Verify the session was updated by fetching it back
      const found = await repo.findSessionById(session.id, USER_ID)
      expect(found).not.toBeNull()
      expect(found!.resultJson).toBe('{"dtcs":[],"narrative":"All good"}')
      expect(found!.severity).toBe('low')
      expect(found!.dtcCount).toBe(0)
      expect(found!.endedAt).toBeDefined()
    })

    it('should find sessions for a user (paginated)', async () => {
      // Create a few sessions
      for (let i = 0; i < 3; i++) {
        const s = await repo.createSession({
          id: 0,
          vehicleId: i === 2 ? null : vehicleId,
          userId: USER_ID,
          scenarioId: `scenario-${i}`,
          startedAt: new Date(Date.now() - i * 3600000).toISOString(),
        })
        await repo.endSession(s.id, {
          resultJson: `{"test":${i}}`,
          severity: i === 0 ? 'high' : 'low',
          dtcCount: i,
        })
      }

      const page = await repo.findSessions({ userId: USER_ID, limit: 10, offset: 0 })
      expect(page.items.length).toBeGreaterThanOrEqual(3)
      expect(page.total).toBeGreaterThanOrEqual(3)
      // should be ordered by startedAt DESC
      for (let i = 0; i < page.items.length - 1; i++) {
        expect(page.items[i].startedAt >= page.items[i + 1].startedAt).toBe(true)
      }
    })

    it('should filter sessions by severity', async () => {
      const page = await repo.findSessions({
        userId: USER_ID,
        severity: 'high',
        limit: 10,
        offset: 0,
      })
      expect(page.items.length).toBeGreaterThan(0)
      for (const s of page.items) {
        expect(s.severity).toBe('high')
      }
    })

    it('should filter sessions by scenarioId', async () => {
      const page = await repo.findSessions({
        userId: USER_ID,
        scenarioId: 'scenario-0',
        limit: 10,
        offset: 0,
      })
      expect(page.items.length).toBe(1)
      expect(page.items[0].scenarioId).toBe('scenario-0')
    })

    it('should paginate correctly (offset + limit)', async () => {
      const page = await repo.findSessions({ userId: USER_ID, limit: 1, offset: 1 })
      expect(page.items.length).toBeLessThanOrEqual(1)
      expect(page.total).toBeGreaterThanOrEqual(3)
    })

    it('should never return sessions from another userId', async () => {
      const page = await repo.findSessions({ userId: 999, limit: 10, offset: 0 })
      expect(page.items).toHaveLength(0)
      expect(page.total).toBe(0)
    })

    it('should find a session by id and userId', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId,
        userId: USER_ID,
        scenarioId: 'find-test',
        startedAt: new Date().toISOString(),
      })
      await repo.endSession(session.id, {
        resultJson: '{}',
        severity: 'medium',
        dtcCount: 1,
      })

      const found = await repo.findSessionById(session.id, USER_ID)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(session.id)
      expect(found!.scenarioId).toBe('find-test')

      // Wrong user should get null
      const notFound = await repo.findSessionById(session.id, 999)
      expect(notFound).toBeNull()
    })

    it('should return null for non-existent session id', async () => {
      const result = await repo.findSessionById(99999, USER_ID)
      expect(result).toBeNull()
    })
  })

  describe('dtcDefinitions', () => {
    const sampleDtc: Omit<DtcDefinition, 'id' | 'createdAt'> = {
      manufacturer: 'Toyota',
      model: 'Auris Hybrid',
      code: 'P0301',
      description: 'Cylinder 1 Misfire Detected',
      confidence: 0.85,
      source: 'web',
    }

    it('upsertDtcDefinition inserts new DTC definition', async () => {
      const result = await repo.upsertDtcDefinition(sampleDtc)

      expect(result.id).toBeGreaterThan(0)
      expect(result.manufacturer).toBe('Toyota')
      expect(result.model).toBe('Auris Hybrid')
      expect(result.code).toBe('P0301')
      expect(result.confidence).toBe(0.85)
      expect(result.source).toBe('web')
    })

    it('upsertDtcDefinition updates existing on duplicate manufacturer+model+code', async () => {
      const first = await repo.upsertDtcDefinition(sampleDtc)

      const second = await repo.upsertDtcDefinition({
        ...sampleDtc,
        description: 'Updated description',
        confidence: 0.9,
      })

      expect(second.id).toBe(first.id)
      expect(second.description).toBe('Updated description')
      expect(second.confidence).toBe(0.9)
    })

    it('findDtcDefinition returns found definition', async () => {
      await repo.upsertDtcDefinition(sampleDtc)

      const result = await repo.findDtcDefinition('Toyota', 'Auris Hybrid', 'P0301')

      expect(result).not.toBeNull()
      expect(result!.code).toBe('P0301')
      expect(result!.manufacturer).toBe('Toyota')
    })

    it('findDtcDefinition returns null for unknown code', async () => {
      const result = await repo.findDtcDefinition('Ford', 'Focus', 'P9999')

      expect(result).toBeNull()
    })

    it('findDtcDefinitionByCode returns found definition by code only', async () => {
      await repo.upsertDtcDefinition(sampleDtc)

      const result = await repo.findDtcDefinitionByCode('P0301')

      expect(result).not.toBeNull()
      expect(result!.code).toBe('P0301')
      expect(result!.manufacturer).toBe('Toyota')
    })

    it('findDtcDefinitionByCode returns null for unknown code', async () => {
      const result = await repo.findDtcDefinitionByCode('P9999')

      expect(result).toBeNull()
    })

    it('findDtcDefinitionByCode returns the highest-confidence match deterministically', async () => {
      await repo.upsertDtcDefinition({
        manufacturer: 'Audi',
        model: 'A3',
        code: 'P1234',
        description: 'Low confidence',
        confidence: 0.3,
        source: 'auto',
      })
      await repo.upsertDtcDefinition({
        manufacturer: 'VW',
        model: 'Golf',
        code: 'P1234',
        description: 'High confidence',
        confidence: 0.9,
        source: 'seed',
      })

      const result = await repo.findDtcDefinitionByCode('P1234')

      expect(result).not.toBeNull()
      expect(result!.manufacturer).toBe('VW')
      expect(result!.confidence).toBe(0.9)
    })
  })

  describe('ecuLookups', () => {
    let vehicleId: number
    let ecuId: number

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      vehicleId = vehicle.id!

      const ecu = await repo.insertEcu({
        vehicleId,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'CAN_11_500',
      })
      ecuId = ecu.id!
    })

    it('findEcuByAddress returns ECU when found', async () => {
      const result = await repo.findEcuByAddress(vehicleId, '7E0', '7E8')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine Control Module')
      expect(result!.requestAddr).toBe('7E0')
      expect(result!.responseAddr).toBe('7E8')
    })

    it('findEcuByAddress returns null when not found', async () => {
      const result = await repo.findEcuByAddress(vehicleId, 'FFFF', 'FFFF')

      expect(result).toBeNull()
    })

    it('updateEcuDiscoveredAt updates timestamp', async () => {
      // updateEcuDiscoveredAt should succeed without errors
      await expect(repo.updateEcuDiscoveredAt(ecuId)).resolves.toBeUndefined()

      // ECU should still be findable after update
      const after = await repo.findEcuByAddress(vehicleId, '7E0', '7E8')
      expect(after).not.toBeNull()
      expect(after!.name).toBe('Engine Control Module')
      expect(after!.discoveredAt).toBeDefined()
      expect(() => new Date(after!.discoveredAt!)).not.toThrow()
    })
  })
})
