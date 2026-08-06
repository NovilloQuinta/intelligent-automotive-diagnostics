import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createServer } from '@/infrastructure/http/server.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'

const mockAuditRepo: AuditLogRepository = { create: async () => {} }
const mockLogger: LoggerPort = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }
const mockAuthController = {
  register: vi.fn(),
  login: vi.fn(),
  refresh: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
} as unknown as AuthController

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: 'car',
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc Inline-4',
      vin: new Vin('JKAZR2A1XLA000111'),
    },
  },
]

let baseUrl: string
let httpServer: Server

beforeAll(async () => {
  const app = createServer({
    diagnosisController: new DiagnosisController(
      new DiagnosisService(mockScenarios, undefined, undefined, mockLogger),
      mockLogger,
    ),
    allowedOrigins: 'http://localhost:3000',
    nodeEnv: 'test',
    auditRepo: mockAuditRepo,
    logger: mockLogger,
    authController: mockAuthController,
  })
  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, () => resolve())
  })
  const { port } = httpServer.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

describe('HTTP server', () => {
  it('should return scenarios on GET /api/scenarios', async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`)
    const body = (await res.json()) as { scenarios: unknown[] }

    expect(res.status).toBe(200)
    expect(body.scenarios).toHaveLength(2)
    expect(body.scenarios[0]).toHaveProperty('id', 'audi-a3-idle')
    expect(body.scenarios[1]).toHaveProperty('id', 'kawa-z900')
  })

  describe('POST /api/diagnosis — Audi A3 (with DTC P0301)', () => {
    let body: Record<string, unknown>

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/api/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: 'audi-a3-idle' }),
      })
      body = (await res.json()) as Record<string, unknown>
    })

    it('should return 200', () => {
      expect(body).toBeDefined()
    })

    it('should return correct RPM (750)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.rpm).toBe(750)
    })

    it('should return correct coolant temperature (90)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.coolantTemp).toBe(90)
    })

    it('should return correct speed (0)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.speed).toBe(0)
    })

    it('should return correct intake temperature (25)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.intakeTemp).toBe(25)
    })

    it('should have one DTC code', () => {
      const dtcs = body.dtcCodes as Array<{ code: string }>
      expect(dtcs).toHaveLength(1)
    })

    it('should contain DTC P0301', () => {
      const dtcs = body.dtcCodes as Array<{ code: string }>
      expect(dtcs[0].code).toBe('P0301')
    })

    it('should generate diagnosis text containing P0301', () => {
      expect(body.diagnosisText).toContain('P0301')
    })

    it('should set severity to high (DTC present, no freeze frame)', () => {
      expect(body.severity).toBe('high')
    })

    it('should include rawData field', () => {
      expect(body.rawData).toBeTruthy()
      expect(body.rawData).toContain('rpm')
    })
  })

  describe('POST /api/diagnosis — Kawasaki Z900 (no DTCs)', () => {
    let body: Record<string, unknown>

    beforeAll(async () => {
      const res = await fetch(`${baseUrl}/api/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: 'kawa-z900' }),
      })
      body = (await res.json()) as Record<string, unknown>
    })

    it('should return correct RPM (4500)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.rpm).toBe(4500)
    })

    it('should return correct coolant temperature (105)', () => {
      const pv = body.parsedValues as Record<string, number>
      expect(pv.coolantTemp).toBe(105)
    })

    it('should have zero DTC codes', () => {
      const dtcs = body.dtcCodes as Array<unknown>
      expect(dtcs).toHaveLength(0)
    })

    it('should set severity to low (no DTCs)', () => {
      expect(body.severity).toBe('low')
    })
  })

  it('should return 404 for unknown scenario', async () => {
    const res = await fetch(`${baseUrl}/api/diagnosis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'nonexistent' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(404)
    expect(body.error).toBe('Scenario not found')
  })

  it('should return CORS header for allowed origin', async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`, {
      headers: { Origin: 'http://localhost:3000' },
    })

    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  it('should not return CORS header for disallowed origin', async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`, {
      headers: { Origin: 'http://evil.com' },
    })

    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  describe('POST /api/mcp/tools/:toolName', () => {
    it('should call read_pid tool and return RPM value', async () => {
      const res = await fetch(`${baseUrl}/api/mcp/tools/read_pid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: 'audi-a3-idle', args: { mode: '01', pid: '0C' } }),
      })
      const body = (await res.json()) as { tool: string; result: string }

      expect(res.status).toBe(200)
      expect(body.tool).toBe('read_pid')
      expect(body.result).toContain('750')
    })

    it('should return diagnostic data from get_dtc_codes tool', async () => {
      const res = await fetch(`${baseUrl}/api/mcp/tools/get_dtc_codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId: 'audi-a3-idle', args: {} }),
      })
      const body = (await res.json()) as { tool: string; result: string }

      expect(res.status).toBe(200)
      expect(body.result).toContain('P0301')
    })
  })

  describe('TCP mode (obdRepo inyectado, scenarios vacíos)', () => {
    let tcpBaseUrl: string
    let tcpServer: Server
    const mockObdRepo: ObdRepository = {
      readPid: vi.fn(async (_mode: string, pid: string) => (pid === '0C' ? 800 : 90)),
      getSupportedPids: vi.fn(async () => ['01 0C']),
      getFreezeFrame: vi.fn(async () => null),
      readDtcCodes: vi.fn(async () => [{ code: 'P0301', description: '' }]),
      clearDtcCodes: vi.fn(async () => undefined),
      readVin: vi.fn(async () => 'WP0ZZZ99ZTS390000'),
      getVehicleInfo: vi.fn(async () => ({
        make: 'Porsche',
        model: 'unknown',
        year: 2026,
        engineType: 'unknown',
        vin: new Vin('WP0ZZZ99ZTS390000'),
      })),
      setPower: vi.fn(async () => undefined),
    }

    beforeAll(async () => {
      const app = createServer({
        diagnosisController: new DiagnosisController(
          new DiagnosisService([], mockObdRepo, undefined, mockLogger),
          mockLogger,
        ),
        allowedOrigins: 'http://localhost:3000',
        nodeEnv: 'test',
        auditRepo: mockAuditRepo,
        logger: mockLogger,
        authController: mockAuthController,
      })
      await new Promise<void>((resolve) => {
        tcpServer = app.listen(0, () => resolve())
      })
      const { port } = tcpServer.address() as AddressInfo
      tcpBaseUrl = `http://localhost:${port}`
    })

    afterAll(async () => {
      await new Promise<void>((resolve) => tcpServer.close(() => resolve()))
    })

    it('should expose the synthetic tcp scenario on GET /api/scenarios', async () => {
      const res = await fetch(`${tcpBaseUrl}/api/scenarios`)
      const body = (await res.json()) as { scenarios: Array<{ id: string; name: string }> }

      expect(res.status).toBe(200)
      expect(body.scenarios).toHaveLength(1)
      expect(body.scenarios[0].id).toBe('tcp')
      expect(body.scenarios[0].name).toBe('ELM327 Direct Connection')
    })

    it('should run diagnosis via obdRepo without scenarioId', async () => {
      const res = await fetch(`${tcpBaseUrl}/api/diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = (await res.json()) as { parsedValues: Record<string, number>; severity: string }

      expect(res.status).toBe(200)
      expect(body.parsedValues.rpm).toBe(800)
      expect(body.severity).toBe('high')
    })

    it('should call MCP tools via obdRepo without scenarioId', async () => {
      const res = await fetch(`${tcpBaseUrl}/api/mcp/tools/get_dtc_codes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: {} }),
      })
      const body = (await res.json()) as { result: string }

      expect(res.status).toBe(200)
      expect(body.result).toContain('P0301')
    })
  })
})
