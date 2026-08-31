import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { eq, sql } from 'drizzle-orm'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { VinDecodeError, Vin } from '@/domain/value-objects/Vin.js'
import type { VehicleProfile } from '@/domain/entities/VehicleProfile.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import type { PidDefinition } from '@/domain/entities/PidDefinition.js'
import type { PidReading } from '@/domain/entities/PidReading.js'
import type { DtcDefinition } from '@/domain/entities/DtcDefinition.js'
import type { EcuDefinition } from '@/domain/entities/EcuDefinition.js'
import { PidCode } from '@/domain/value-objects/PidCode.js'

describe('SqliteVehicleRepository', () => {
  let db: DiagnosticsDb
  let repo: SqliteVehicleRepository

  beforeAll(() => {
    resetDb()
    db = getDb()
    repo = new SqliteVehicleRepository(db)
  })

  afterAll(() => {
    resetDb()
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
    function rpmPid(): PidDefinition {
      return {
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

    it('should persist the system label and not write vehicle_id/ecu_id columns', async () => {
      const inserted = await repo.insertPidDefinition({
        ...rpmPid(),
        manufacturer: 'Audi',
        model: 'A3',
        system: 'Engine',
      })

      const row = await db
        .select()
        .from(schema.pidDefinitions)
        .where(eq(schema.pidDefinitions.id, inserted.id))
        .limit(1)

      expect(row[0].system).toBe('Engine')
      const columns = db
        .all<{ name: string }>(sql`SELECT name FROM pragma_table_info('pid_definitions')`)
        .map((c) => c.name)
      expect(columns).not.toContain('vehicle_id')
      expect(columns).not.toContain('ecu_id')
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
      await repo.insertPidDefinition({
        ...rpmPid(),
        manufacturer: 'Ford',
        model: 'Focus',
      })

      const result = await repo.findPidDefinition('01', '0C')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Engine RPM')
    })

    it('should store and find a PID definition with manufacturer/model', async () => {
      await repo.insertPidDefinition({
        ...rpmPid(),
        manufacturer: 'VW',
        model: 'Golf',
      })

      // Should find with matching manufacturer/model
      const found = await repo.findPidDefinition('01', '0C', 'VW', 'Golf')
      expect(found).not.toBeNull()
      expect(found!.manufacturer).toBe('VW')
      expect(found!.model).toBe('Golf')

      // Should NOT find with different manufacturer/model
      const notFound = await repo.findPidDefinition('01', '0C', 'Honda', 'Civic')
      expect(notFound).toBeNull()
    })

    it('should find PIDs by manufacturer/model including universal definitions', async () => {
      await repo.insertPidDefinition({
        ...rpmPid(),
        pidCode: new PidCode('01', '0D'),
        manufacturer: 'Audi',
        model: 'A3',
        name: 'Engine RPM (Audi)',
        system: 'Engine',
      })
      await repo.insertPidDefinition({
        ...rpmPid(),
        pidCode: new PidCode('22', 'F40D'),
        manufacturer: 'Audi',
        model: 'A3',
        name: 'Battery Voltage',
        system: 'Battery',
      })
      await repo.insertPidDefinition({
        ...rpmPid(),
        pidCode: new PidCode('22', 'AAAA'),
        name: 'Universal Engine RPM',
        system: 'Engine',
      })

      const pids = await repo.findPidsByManufacturerModel('Audi', 'A3')

      expect(pids.map((p) => p.name)).toContain('Engine RPM (Audi)')
      expect(pids.map((p) => p.name)).toContain('Battery Voltage')
      expect(pids.map((p) => p.name)).toContain('Universal Engine RPM')
    })

    it('should store an LLM-guessed PID with lower confidence', async () => {
      const llmPid: PidDefinition = {
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
    let sessionId: number

    beforeAll(async () => {
      const vehicle = await repo.upsertVehicle(toyotaAuris)
      const pid = await repo.insertPidDefinition({
        pidCode: new PidCode('01', '0D'),
        name: 'Vehicle Speed',
        formula: 'A',
        unit: 'km/h',
        dataBytes: 1,
        pidType: 'formula',
        confidence: 1.0,
        source: 'manual',
        manufacturer: 'Toyota',
        model: 'Auris Hybrid',
      })
      pidDefId = pid.id!
      const session = await repo.createSession({
        id: 0,
        vehicleId: vehicle.id,
        scenarioId: 'pid-readings',
        startedAt: new Date().toISOString(),
      })
      sessionId = session.id
    })

    it('should insert a PID reading and persist mode/pidCode/sessionId as int', async () => {
      const reading: PidReading = {
        pidDefId,
        mode: '01',
        pidCode: '0D',
        sessionId,
        rawHex: '0C7B',
        parsedValue: 797.75,
      }

      const result = await repo.insertPidReading(reading)

      expect(result.id).toBeGreaterThan(0)
      expect(result.rawHex).toBe('0C7B')
      expect(result.parsedValue).toBeCloseTo(797.75)

      const row = await db
        .select()
        .from(schema.pidReadings)
        .where(eq(schema.pidReadings.id, result.id))
        .limit(1)

      expect(row[0].mode).toBe('01')
      expect(row[0].pidCode).toBe('0D')
      expect(row[0].sessionId).toBe(sessionId)
      expect(typeof row[0].sessionId).toBe('number')
      expect(row[0].pidDefId).toBe(pidDefId)
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

    it('should update the session result in place without creating a new session', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId,
        userId: USER_ID,
        scenarioId: 'follow-up-test',
        startedAt: new Date().toISOString(),
      })
      await repo.endSession(session.id, {
        resultJson: '{"conversation":[]}',
        severity: 'medium',
        dtcCount: 1,
      })

      await repo.updateSessionResult(session.id, {
        resultJson: '{"conversation":[{"role":"assistant","text":"hola","timestamp":"x"}]}',
        severity: 'high',
        dtcCount: 2,
      })

      const found = await repo.findSessionById(session.id, USER_ID)
      expect(found).not.toBeNull()
      expect(found!.id).toBe(session.id)
      expect(found!.resultJson).toBe(
        '{"conversation":[{"role":"assistant","text":"hola","timestamp":"x"}]}',
      )
      expect(found!.severity).toBe('high')
      expect(found!.dtcCount).toBe(2)
      expect(found!.endedAt).toBeDefined()
    })

    it('should preserve endedAt when updating session result (follow-up does not re-close)', async () => {
      const session = await repo.createSession({
        id: 0,
        vehicleId,
        userId: USER_ID,
        scenarioId: 'follow-up-ended-at',
        startedAt: new Date().toISOString(),
      })
      await repo.endSession(session.id, {
        resultJson: '{"conversation":[]}',
        severity: 'medium',
        dtcCount: 1,
      })

      const closed = await repo.findSessionById(session.id, USER_ID)
      const endedAtBefore = closed!.endedAt
      expect(endedAtBefore).toBeDefined()

      // Asegura que el follow-up ocurre claramente despues del cierre inicial
      await new Promise((resolve) => setTimeout(resolve, 10))

      await repo.updateSessionResult(session.id, {
        resultJson: '{"conversation":[{"role":"assistant","text":"hola","timestamp":"x"}]}',
        severity: 'high',
        dtcCount: 2,
      })

      const updated = await repo.findSessionById(session.id, USER_ID)
      expect(updated!.endedAt).toBe(endedAtBefore)
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

  describe('ecuDefinitions', () => {
    const sampleEcu: Omit<EcuDefinition, 'id' | 'createdAt'> = {
      manufacturer: 'Audi',
      model: 'A3',
      responseAddr: '7E9',
      requestAddr: '7E1',
      name: 'Transmission Control Module',
      type: 'TCM',
      system: 'Transmission',
      confidence: 0.8,
      source: 'mechanic',
    }

    it('upsertEcuDefinition inserts a new definition and normalizes addresses', async () => {
      const result = await repo.upsertEcuDefinition(sampleEcu)

      expect(result.id).toBeGreaterThan(0)
      expect(result.responseAddr).toBe('7E9')
      expect(result.requestAddr).toBe('7E1')
      expect(result.name).toBe('Transmission Control Module')
      expect(result.confidence).toBe(0.8)
      expect(result.source).toBe('mechanic')
    })

    it('upsertEcuDefinition updates existing on duplicate (manufacturer, model, response_addr)', async () => {
      const first = await repo.upsertEcuDefinition(sampleEcu)

      const second = await repo.upsertEcuDefinition({
        ...sampleEcu,
        name: 'Gearbox Control Unit',
        confidence: 0.9,
      })

      expect(second.id).toBe(first.id)
      expect(second.name).toBe('Gearbox Control Unit')
      expect(second.confidence).toBe(0.9)
    })

    it('upsertEcuDefinition never degrades an existing definition with a lower confidence', async () => {
      const first = await repo.upsertEcuDefinition({
        ...sampleEcu,
        responseAddr: '7F4',
        confidence: 0.9,
      })

      const second = await repo.upsertEcuDefinition({
        ...sampleEcu,
        responseAddr: '7F4',
        name: 'Wrong guess from the web',
        confidence: 0.3,
        source: 'web',
      })

      expect(second.id).toBe(first.id)
      expect(second.name).toBe(first.name)
      expect(second.confidence).toBe(0.9)
      expect(second.source).toBe(first.source)
    })

    // La busqueda de resolucion ensancha a la marca para poder heredar entre modelos, pero
    // el upsert **no** puede usar esa consulta: decidir si inserta o actualiza exige la
    // clave unica exacta, o una definicion de marca machacaria la de un modelo concreto.
    it('upsertEcuDefinition keeps definitions of different models apart', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A1',
        responseAddr: '7FA',
        name: 'Del A1',
        confidence: 0.9,
      })
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: '',
        responseAddr: '7FA',
        name: 'De la marca',
        confidence: 0.3,
      })

      const delA1 = await repo.findEcuDefinitionByAddress('Audi', 'A1', '7FA')
      const deLaMarca = await repo.findEcuDefinitionByAddress('Audi', '', '7FA')

      expect(delA1!.name).toBe('Del A1')
      expect(delA1!.confidence).toBe(0.9)
      expect(deLaMarca!.name).toBe('De la marca')
      expect(deLaMarca!.id).not.toBe(delA1!.id)
    })

    it('findEcuDefinitionByAddress returns the matching definition', async () => {
      // Direccion propia (no '7E9' de sampleEcu): otros tests de este describe ya
      // suben la confianza de esa clave, y `upsertEcuDefinition` ya no degrada.
      await repo.upsertEcuDefinition({ ...sampleEcu, responseAddr: '7F5' })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'A3', '7F5')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Transmission Control Module')
      expect(result!.type).toBe('TCM')
      expect(result!.system).toBe('Transmission')
    })

    it('findEcuDefinitionByAddress returns null for unknown address', async () => {
      const result = await repo.findEcuDefinitionByAddress('Audi', 'A3', '7DA')

      expect(result).toBeNull()
    })

    // Un A3 y un A5 comparten plataforma y, con ella, las direcciones del bus. Buscar en
    // estricto por modelo dejaria lo aprendido en uno invisible para el otro.
    it('findEcuDefinitionByAddress falls back to another model of the same manufacturer', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A3',
        responseAddr: '7EB',
        name: 'Airbag A3',
        confidence: 0.5,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'A5', '7EB')

      expect(result).not.toBeNull()
      expect(result!.name).toBe('Airbag A3')
    })

    it('findEcuDefinitionByAddress prefers the exact model over a sibling one', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A3',
        responseAddr: '7EC',
        name: 'Del A3',
        confidence: 0.9,
      })
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A5',
        responseAddr: '7EC',
        name: 'Del A5',
        confidence: 0.3,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'A5', '7EC')

      // Gana el modelo exacto aunque su confianza sea la mas baja de las dos.
      expect(result!.name).toBe('Del A5')
    })

    it('findEcuDefinitionByAddress ranks sibling models by confidence', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A1',
        responseAddr: '7ED',
        name: 'Poco fiable',
        confidence: 0.3,
      })
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A4',
        responseAddr: '7ED',
        name: 'Mas fiable',
        confidence: 0.8,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'A6', '7ED')

      expect(result!.name).toBe('Mas fiable')
    })

    // El modelo vacio significa "vale para toda la marca", igual que el fabricante vacio en
    // `pid_definitions` marca los PID estandar. Es lo que el agente escribe cuando sabe que
    // la centralita es comun a la plataforma y no de un modelo concreto.
    it('findEcuDefinitionByAddress accepts a brand-wide definition (empty model)', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: '',
        responseAddr: '7F0',
        name: 'Comun a la marca',
        confidence: 0.3,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'Q7', '7F0')

      expect(result!.name).toBe('Comun a la marca')
    })

    it('findEcuDefinitionByAddress prefers a brand-wide definition over a sibling model', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'A1',
        responseAddr: '7F1',
        name: 'Extrapolado del A1',
        confidence: 0.9,
      })
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: '',
        responseAddr: '7F1',
        name: 'Declarado para la marca',
        confidence: 0.3,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'Q7', '7F1')

      // Lo declarado a proposito para la marca gana a la extrapolacion desde un hermano,
      // aunque el hermano tenga mas confianza.
      expect(result!.name).toBe('Declarado para la marca')
    })

    it('findEcuDefinitionByAddress still prefers the exact model over a brand-wide one', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: '',
        responseAddr: '7F2',
        name: 'De la marca',
        confidence: 0.9,
      })
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        model: 'Q7',
        responseAddr: '7F2',
        name: 'Del Q7',
        confidence: 0.3,
      })

      const result = await repo.findEcuDefinitionByAddress('Audi', 'Q7', '7F2')

      expect(result!.name).toBe('Del Q7')
    })

    // Con un coche real el modelo nunca se conoce: el WMI da la marca, no el modelo.
    it('findEcuDefinitionByAddress serves a brand-wide definition when the model is unknown', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        manufacturer: 'Ford',
        model: '',
        responseAddr: '7F3',
        name: 'Modulo de carroceria',
        confidence: 0.3,
      })

      const result = await repo.findEcuDefinitionByAddress('Ford', 'unknown', '7F3')

      expect(result!.name).toBe('Modulo de carroceria')
    })

    it('findEcuDefinitionByAddress never crosses manufacturers', async () => {
      await repo.upsertEcuDefinition({
        ...sampleEcu,
        manufacturer: 'Audi',
        model: 'A3',
        responseAddr: '7EE',
        name: 'De un Audi',
      })

      const result = await repo.findEcuDefinitionByAddress('Toyota', 'Corolla', '7EE')

      expect(result).toBeNull()
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

  describe('vehicleIdentities', () => {
    it('upsertVehicleIdentity inserts and normalizes WMI y fabricante', async () => {
      const result = await repo.upsertVehicleIdentity({
        wmi: 'vr3',
        manufacturer: 'peugeot',
        confidence: 0.3,
        source: 'web',
      })

      expect(result.id).toBeGreaterThan(0)
      expect(result.wmi).toBe('VR3')
      expect(result.manufacturer).toBe('Peugeot')
    })

    it('findVehicleIdentityByWmi encuentra por WMI en minusculas', async () => {
      await repo.upsertVehicleIdentity({
        wmi: 'ZFA',
        manufacturer: 'Fiat',
        confidence: 0.9,
        source: 'seed',
      })

      const result = await repo.findVehicleIdentityByWmi('zfa')

      expect(result).not.toBeNull()
      expect(result!.manufacturer).toBe('Fiat')
      expect(result!.source).toBe('seed')
    })

    it('findVehicleIdentityByWmi devuelve null si el WMI no esta', async () => {
      expect(await repo.findVehicleIdentityByWmi('XYZ')).toBeNull()
    })

    it('no degrada una entrada existente con otra de menos confianza', async () => {
      // Lo aprendido de la web (0.3) no puede pisar lo sembrado (0.9): si no,
      // un resultado flojo de internet degradaria el catalogo oficial.
      await repo.upsertVehicleIdentity({
        wmi: 'WAU',
        manufacturer: 'Audi',
        confidence: 0.9,
        source: 'seed',
      })

      const result = await repo.upsertVehicleIdentity({
        wmi: 'WAU',
        manufacturer: 'Audi Sport',
        confidence: 0.3,
        source: 'web',
      })

      expect(result.manufacturer).toBe('Audi')
      expect(result.confidence).toBe(0.9)
      expect(result.source).toBe('seed')
    })

    it('actualiza cuando la nueva entrada tiene mas confianza', async () => {
      await repo.upsertVehicleIdentity({
        wmi: 'VF7',
        manufacturer: 'Citroen',
        confidence: 0.3,
        source: 'web',
      })

      const result = await repo.upsertVehicleIdentity({
        wmi: 'VF7',
        manufacturer: 'Citroën',
        confidence: 0.8,
        source: 'mechanic',
      })

      expect(result.manufacturer).toBe('Citroën')
      expect(result.confidence).toBe(0.8)
      expect(result.source).toBe('mechanic')
    })
  })
})
