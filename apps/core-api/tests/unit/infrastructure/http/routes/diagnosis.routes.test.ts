import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { SimulationScenario } from '@/infrastructure/obd/simulationScenario.js'
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import type { LlmClientPort, ToolCallTrace } from '@/application/ports/llmClient.port.js'

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralenti',
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

function createApp() {
  const app = express()
  app.use(express.json())
  const router = createDiagnosisRoutes({ scenarios: mockScenarios })
  app.use('/api', router)
  return app
}

/** Repositorio OBD mockeado: RPM 800, coolant 90, sin freeze frame, DTC P0301. */
const mockObdRepo: ObdRepositoryPort = {
  readPid: vi.fn(async (_mode: string, pid: string) => (pid === '0C' ? 800 : 90)),
  getSupportedPids: vi.fn(async () => ['01 0C']),
  getFreezeFrame: vi.fn(async () => null),
  readDtcCodes: vi.fn(async () => [{ code: 'P0301', description: '' }]),
  clearDtcCodes: vi.fn(async () => undefined),
  readVin: vi.fn(async () => 'WAUZZZ8V5JA123456'),
  getVehicleInfo: vi.fn(async () => ({
    make: 'Audi',
    model: 'unknown',
    year: 2018,
    engineType: 'unknown',
    vin: new Vin('WAUZZZ8V5JA123456'),
  })),
  setPower: vi.fn(async () => undefined),
}

function createTcpApp() {
  const app = express()
  app.use(express.json())
  const router = createDiagnosisRoutes({ scenarios: mockScenarios, obdRepo: mockObdRepo })
  app.use('/api', router)
  return app
}

/** Cliente LLM mockeado con sendMessage controlable. */
function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

function createCognitiveApp(llmClient: LlmClientPort, cognitiveTimeoutMs?: number) {
  const app = express()
  app.use(express.json())
  const router = createDiagnosisRoutes({ scenarios: mockScenarios, llmClient, cognitiveTimeoutMs })
  app.use('/api', router)
  return app
}

/** Respuesta LLM estándar: narrativa + bloque ---JSON--- válido + traza de 2 tools. */
const cognitiveText =
  'El motor tiembla en ralentí por fallo de encendido. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
const cognitiveToolCalls: ToolCallTrace[] = [
  { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
  { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
]

describe('diagnosisRoutes', () => {
  describe('GET /api/scenarios', () => {
    it('should return the list of scenarios', async () => {
      const app = createApp()
      const res = await request(app).get('/api/scenarios')

      expect(res.status).toBe(200)
      expect(res.body.scenarios).toHaveLength(2)
    })
  })

  describe('POST /api/diagnosis', () => {
    it('should run diagnosis for a valid scenario', async () => {
      const app = createApp()
      const res = await request(app).post('/api/diagnosis').send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(200)
      expect(res.body.severity).toBe('high')
      expect(res.body.parsedValues.rpm).toBe(750)
      expect(res.body.dtcCodes).toHaveLength(1)
    })

    it('should return 404 for an unknown scenario', async () => {
      const app = createApp()
      const res = await request(app).post('/api/diagnosis').send({ scenarioId: 'nonexistent' })

      expect(res.status).toBe(404)
    })

    it('should return 400 for invalid body', async () => {
      const app = createApp()
      const res = await request(app).post('/api/diagnosis').send({})

      expect(res.status).toBe(400)
    })
  })

  describe('TCP mode (con obdRepo)', () => {
    it('should run diagnosis via obdRepo without scenarioId', async () => {
      const app = createTcpApp()
      const res = await request(app).post('/api/diagnosis').send({})

      expect(res.status).toBe(200)
      expect(res.body.parsedValues.rpm).toBe(800)
      expect(res.body.parsedValues.coolantTemp).toBe(90)
      expect(res.body.dtcCodes).toEqual([{ code: 'P0301', description: '' }])
      expect(res.body.severity).toBe('high')
      expect(mockObdRepo.readPid).toHaveBeenCalledWith('01', '0C')
    })

    it('should return the synthetic tcp scenario on GET /scenarios', async () => {
      const app = createTcpApp()
      const res = await request(app).get('/api/scenarios')

      expect(res.status).toBe(200)
      expect(res.body.scenarios).toHaveLength(1)
      expect(res.body.scenarios[0]).toMatchObject({
        id: 'tcp',
        name: 'ELM327 Direct Connection',
        vehicleType: 'car',
      })
    })

    it('should call MCP tools via obdRepo without scenarioId', async () => {
      const app = createTcpApp()
      const res = await request(app)
        .post('/api/mcp/tools/read_pid')
        .send({ args: { mode: '01', pid: '0C' } })

      expect(res.status).toBe(200)
      expect(res.body.result).toBe('800')
      expect(mockObdRepo.readPid).toHaveBeenCalledWith('01', '0C')
    })
  })

  describe('POST /api/mcp/cognitive-diagnosis', () => {
    it('should return a complete CognitiveDiagnosisResult', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const app = createCognitiveApp(llmClient)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: '¿Por qué tiembla el motor al ralentí?' })

      expect(res.status).toBe(200)
      expect(res.body.diagnosis).toBe(cognitiveText)
      expect(res.body.severity).toBe('high')
      expect(res.body.confidence).toBe(0.9)
      expect(res.body.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
      expect(res.body.toolCalls).toEqual(cognitiveToolCalls)
    })

    it('should send the 6 MCP tool definitions and a bridge handler to the LLM', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const app = createCognitiveApp(llmClient)

      await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: '¿Por qué tiembla el motor al ralentí?' })

      const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(input.tools).toHaveLength(6)
      expect(input.tools.map((t: { name: string }) => t.name)).toEqual([
        'read_pid',
        'get_dtc_codes',
        'get_freeze_frame',
        'read_vin',
        'get_vehicle_info',
        'get_available_pids',
      ])
      expect(input.userMessage).toContain('¿Por qué tiembla el motor al ralentí?')
      expect(input.userMessage).toContain('Audi A3')
      await expect(input.handler('read_pid', { mode: '01', pid: '0C' })).resolves.toBe('750')
    })

    it('should return 404 when the scenario does not exist', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi
          .fn()
          .mockResolvedValue({ text: cognitiveText, toolCalls: cognitiveToolCalls }),
      })
      const app = createCognitiveApp(llmClient)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'no-existe' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Scenario not found')
      expect(llmClient.sendMessage).not.toHaveBeenCalled()
    })

    it('should return 400 for an invalid body', async () => {
      const llmClient = mockLlmClient()
      const app = createCognitiveApp(llmClient)

      const res = await request(app).post('/api/mcp/cognitive-diagnosis').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
    })

    it('should return 504 when the LLM exceeds the timeout', async () => {
      const never = new Promise<never>(() => {})
      const llmClient = mockLlmClient({ sendMessage: vi.fn(() => never) })
      // Timeout corto inyectable para no esperar los 60s reales del default
      const app = createCognitiveApp(llmClient, 100)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: 'x' })

      expect(res.status).toBe(504)
      expect(res.body.error).toBe('Cognitive diagnosis timed out')
    })

    it('should return 500 without leaking details when the LLM fails', async () => {
      const llmClient = mockLlmClient({
        sendMessage: vi.fn().mockRejectedValue(new Error('llm internal explosion')),
      })
      const app = createCognitiveApp(llmClient)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: 'x' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
      expect(JSON.stringify(res.body)).not.toContain('llm internal explosion')
    })

    it('should not mount the endpoint when no llmClient is provided', async () => {
      const app = createApp()

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: 'x' })

      expect(res.status).toBe(404)
    })
  })
})
