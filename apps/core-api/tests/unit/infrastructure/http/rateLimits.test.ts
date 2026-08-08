import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { Request, Response } from 'express'
import { createServer } from '@/infrastructure/http/server.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import type { Request, Response, NextFunction } from 'express'

const mockAuditRepo: AuditLogRepository = {
  create: async () => {},
  list: async () => ({ items: [], total: 0 }),
  stats: async () => ({ byStatusCode: {}, byPath: {} }),
}
const mockLogger: LoggerPort = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

const mockAuthController = {
  register: vi.fn(async (_req: Request, res: Response) => {
    res.status(201).json({ id: 1 })
  }),
  login: vi.fn(async (_req: Request, res: Response) => {
    res.status(401).json({ error: 'Invalid credentials' })
  }),
  refresh: vi.fn(async (_req: Request, res: Response) => {
    res.status(401).json({ error: 'Invalid refresh token' })
  }),
  me: vi.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ id: 1 })
  }),
  logout: vi.fn(async (_req: Request, res: Response) => {
    res.status(200).json({ success: true })
  }),
} as unknown as AuthController

const mockLlmClient: LlmClientPort = {
  sendMessage: vi.fn(async () => ({
    text: 'Diagnóstico cognitivo.\n---JSON\n{"severity":"low","confidence":0.9,"recommendations":["Revisar bujías"]}\n---',
    toolCalls: [],
  })),
  sendSingleMessage: vi.fn(async () => ({ text: 'ok', toolCalls: [], raw: {} })),
}

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
]

function createMockRepo(): ObdRepository {
  return {
    readPid: vi.fn(async (_mode: string, pid: string) => {
      if (pid === '0C') return 750
      if (pid === '05') return 90
      if (pid === '0D') return 0
      if (pid === '0F') return 25
      return 0
    }),
    getSupportedPids: vi.fn(async () => []),
    getFreezeFrame: vi.fn(async () => null),
    readDtcCodes: vi.fn(async () => [{ code: 'P0301', description: 'Cylinder 1 Misfire' }]),
    clearDtcCodes: vi.fn(async () => undefined),
    readVin: vi.fn(async () => 'WAUZZZ8V5JA123456'),
    getVehicleInfo: vi.fn(async () => ({
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: new Vin('WAUZZZ8V5JA123456'),
    })),
    setPower: vi.fn(async () => undefined),
    getEcuInfo: vi.fn(async () => []),
  } as unknown as ObdRepository
}

const mockObdRepos = new Map([['audi-a3-idle', createMockRepo()]])

const originalNodeEnv = process.env.NODE_ENV

interface BootedApp {
  readonly baseUrl: string
  readonly close: () => Promise<void>
}

/** requireAdmin de prueba: nunca bloquea. El foco de este archivo es el rate limit, no el rol. */
const noopRequireAdmin = (_req: Request, _res: Response, next: NextFunction): void => next()

/** AdminController de prueba: cada metodo responde 200 sin tocar ningun repositorio. */
const mockAdminController = {
  overview: vi.fn((_req: Request, res: Response) => res.status(200).json({})),
  logs: vi.fn((_req: Request, res: Response) => res.status(200).json({ items: [], total: 0 })),
  auditLogs: vi.fn((_req: Request, res: Response) => res.status(200).json({ items: [], total: 0 })),
  users: vi.fn((_req: Request, res: Response) => res.status(200).json({ items: [], total: 0 })),
  knowledge: vi.fn((_req: Request, res: Response) => res.status(200).json({})),
  searchKnowledge: vi.fn((_req: Request, res: Response) => res.status(200).json({ results: [] })),
} as unknown as AdminController

/** Bootea una instancia fresca de la app con limiters activos (NODE_ENV=production). */
async function bootApp(): Promise<BootedApp> {
  const app = createServer({
    diagnosisController: new DiagnosisController(
      new DiagnosisService({
        scenarios: mockScenarios,
        obdRepos: mockObdRepos,
        llmClient: mockLlmClient,
        logger: mockLogger,
      }),
      mockLogger,
    ),
    allowedOrigins: 'http://localhost:3000',
    nodeEnv: 'test',
    auditRepo: mockAuditRepo,
    logger: mockLogger,
    authController: mockAuthController,
    adminController: mockAdminController,
    requireAdmin: noopRequireAdmin,
  })
  const httpServer = await new Promise<Server>((resolve) => {
    const server = app.listen(0, () => resolve(server))
  })
  const { port } = httpServer.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  }
}

async function postJson(baseUrl: string, path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('HTTP server rate limits', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production'
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('should allow 5 POST /api/auth/login requests and return 429 on the 6th', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const credentials = { email: 'user@example.com', password: 'wrong-password' }

      for (let i = 0; i < 5; i += 1) {
        const res = await postJson(baseUrl, '/api/auth/login', credentials)
        expect(res.status).toBe(401)
      }

      const res = await postJson(baseUrl, '/api/auth/login', credentials)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should allow 10 POST /api/auth/refresh requests and return 429 on the 11th', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const body = { refreshToken: 'mock-refresh-token' }

      for (let i = 0; i < 10; i += 1) {
        const res = await postJson(baseUrl, '/api/auth/refresh', body)
        expect(res.status).toBe(401)
      }

      const res = await postJson(baseUrl, '/api/auth/refresh', body)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should allow 20 POST /api/diagnosis requests and return 429 on the 21st', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const body = { scenarioId: 'audi-a3-idle' }

      for (let i = 0; i < 20; i += 1) {
        const res = await postJson(baseUrl, '/api/diagnosis', body)
        expect(res.status).toBe(200)
      }

      const res = await postJson(baseUrl, '/api/diagnosis', body)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should allow 5 POST /api/mcp/cognitive-diagnosis requests and return 429 on the 6th', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const body = { scenarioId: 'audi-a3-idle', query: '¿Por qué tiembla el motor?' }

      for (let i = 0; i < 5; i += 1) {
        const res = await postJson(baseUrl, '/api/mcp/cognitive-diagnosis', body)
        expect(res.status).toBe(200)
      }

      const res = await postJson(baseUrl, '/api/mcp/cognitive-diagnosis', body)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should allow 20 GET /api/freeze-frame requests and return 429 on the 21st', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const url = `${baseUrl}/api/freeze-frame?scenarioId=audi-a3-idle&dtc=P0301`

      for (let i = 0; i < 20; i += 1) {
        const res = await fetch(url)
        expect(res.status).toBe(200)
      }

      const res = await fetch(url)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should allow 20 GET /api/ecu-info requests and return 429 on the 21st', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const url = `${baseUrl}/api/ecu-info?scenarioId=audi-a3-idle`

      for (let i = 0; i < 20; i += 1) {
        const res = await fetch(url)
        expect(res.status).toBe(200)
      }

      const res = await fetch(url)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should return the rate limit error body and ratelimit headers when a 429 is triggered', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const credentials = { email: 'user@example.com', password: 'wrong-password' }

      for (let i = 0; i < 5; i += 1) {
        await postJson(baseUrl, '/api/auth/login', credentials)
      }

      const res = await postJson(baseUrl, '/api/auth/login', credentials)
      const body = (await res.json()) as { error: string }

      expect(res.status).toBe(429)
      expect(body).toEqual({ error: 'Too many requests, please try again later.' })
      const rateLimitHeaders = Array.from(res.headers.keys()).filter((header) =>
        header.toLowerCase().includes('ratelimit'),
      )
      expect(rateLimitHeaders.length).toBeGreaterThan(0)
    } finally {
      await close()
    }
  })

  it('should allow 30 GET /api/admin/overview requests and return 429 on the 31st', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const url = `${baseUrl}/api/admin/overview`

      for (let i = 0; i < 30; i += 1) {
        const res = await fetch(url)
        expect(res.status).toBe(200)
      }

      const res = await fetch(url)
      expect(res.status).toBe(429)
    } finally {
      await close()
    }
  })

  it('should not let /api/admin exhaustion affect /api/diagnosis, nor vice versa', async () => {
    const { baseUrl, close } = await bootApp()
    try {
      const adminUrl = `${baseUrl}/api/admin/overview`
      for (let i = 0; i < 30; i += 1) {
        await fetch(adminUrl)
      }
      const exhaustedAdmin = await fetch(adminUrl)
      expect(exhaustedAdmin.status).toBe(429)

      // El limite de /api/diagnosis (20/min) sigue intacto tras agotar el de /api/admin.
      const diagnosisBody = { scenarioId: 'audi-a3-idle' }
      const diagnosisRes = await postJson(baseUrl, '/api/diagnosis', diagnosisBody)
      expect(diagnosisRes.status).toBe(200)
    } finally {
      await close()
    }
  })
})
