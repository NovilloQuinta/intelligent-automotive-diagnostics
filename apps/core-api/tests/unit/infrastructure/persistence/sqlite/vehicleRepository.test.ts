import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { VinDecodeError } from '@/infrastructure/obd/protocol/vinDecoder.js'
import type { VehicleProfile } from '@/domain/entities/vehicleProfile.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { PidDefinition, PidReading } from '@/domain/entities/pidDefinition.js'

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

      CREATE TABLE IF NOT EXISTS diagnosis_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
        scenario_id TEXT,
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        ended_at TEXT
      );
    `)

    db = drizzle(sqlite, { schema })
    repo = new SqliteVehicleRepository(db)
  })

  const toyotaAuris: VehicleProfile = {
    vin: 'SB1KE76L40E001234',
    make: 'Toyota',
    model: 'Auris Hybrid',
    year: 2014,
    engineType: '1.8L Hybrid',
  }

  describe('upsertVehicle', () => {
    it('should insert a new vehicle and assign an id', async () => {
      const result = await repo.upsertVehicle(toyotaAuris)

      expect(result.id).toBeGreaterThan(0)
      expect(result.vin).toBe(toyotaAuris.vin)
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

    it('should throw VinDecodeError when VIN has wrong length', async () => {
      await expect(repo.upsertVehicle({ ...toyotaAuris, vin: 'SHORT' })).rejects.toThrow(
        VinDecodeError,
      )
    })

    it('should throw VinDecodeError when VIN has forbidden character I', async () => {
      await expect(
        repo.upsertVehicle({ ...toyotaAuris, vin: 'WAIZZZ8V5JA123456' }),
      ).rejects.toThrow(VinDecodeError)
    })
  })

  describe('findVehicleByVin', () => {
    it('should find a vehicle by VIN', async () => {
      await repo.upsertVehicle(toyotaAuris)

      const result = await repo.findVehicleByVin(toyotaAuris.vin)

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
        mode: '01',
        pidCode: '0C',
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

    it('should find a PID definition by mode, pidCode and vehicleId', async () => {
      await repo.insertPidDefinition(rpmPid())

      const result = await repo.findPidDefinition('01', '0C', vehicleId)

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine RPM')
      expect(result!.formula).toBe('(A*256+B)/4')
    })

    it('should return null for unknown PID', async () => {
      const result = await repo.findPidDefinition('22', 'FFFF', vehicleId)

      expect(result).toBeNull()
    })

    it('should find a PID by mode and code without vehicleId filter', async () => {
      await repo.insertPidDefinition(rpmPid())

      const result = await repo.findPidDefinition('01', '0C')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine RPM')
    })

    it('should find all PIDs for a vehicle', async () => {
      await repo.insertPidDefinition({
        vehicleId,
        ecuId,
        mode: '01',
        pidCode: '05',
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
        mode: '22',
        pidCode: '0300',
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
        mode: '01',
        pidCode: '0C',
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

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      vehicleId = vehicle.id!
    })

    it('should create and end a diagnosis session', async () => {
      const session = await repo.createSession({
        vehicleId,
        scenarioId: 'toyota-auris-hybrid',
      })

      expect(session.id).toBeGreaterThan(0)
      expect(session.vehicleId).toBe(vehicleId)

      await repo.endSession(session.id!)
    })
  })
})
