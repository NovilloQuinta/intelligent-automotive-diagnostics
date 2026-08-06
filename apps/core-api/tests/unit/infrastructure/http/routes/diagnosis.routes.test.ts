import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import {
  DiagnosisService,
  DiagnosisScenarioNotFoundError,
  CognitiveDiagnosisUnavailableError,
  CognitiveDiagnosisTimeoutError,
  ToolNotFoundError,
  ToolCallTimeoutError,
} from '@/infrastructure/services/diagnosisService.js'
import { Vin } from '@/domain/value-objects/vin.js'
import type { SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { ToolCallTrace } from '@/application/ports/LlmClientPort.js'

const mockLogger: LoggerPort = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}

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

/** Escenario sintetico del modo TCP (constante duplicada del servicio a efectos de fixture). */
const tcpScenario: SimulationScenario = {
  id: 'tcp',
  name: 'ELM327 Direct Connection',
  vehicleType: 'car',
  sensorValues: { rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 },
  dtcConfig: [],
  vehicleInfo: {
    make: 'unknown',
    model: 'unknown',
    year: 0,
    engineType: 'unknown',
    vin: new Vin('WAUZZZ8V5JA123456'),
  },
}

/** Salida tipica de diagnose() formateada por el servicio. */
const diagnoseOutput = {
  rawData: '{"rpm":750,"coolantTemp":90,"speed":0,"intakeTemp":25}',
  parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
  dtcCodes: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
  diagnosisText: '[HIGH] P0301',
  severity: 'high',
}

/** Respuesta LLM estandar: narrativa + bloque ---JSON--- valido + traza de 2 tools. */
const cognitiveText =
  'El motor tiembla en ralentí por fallo de encendido. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
const cognitiveToolCalls: ToolCallTrace[] = [
  { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
  { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
]

const cognitiveOutput = {
  diagnosis: cognitiveText,
  severity: 'high',
  confidence: 0.9,
  recommendations: ['Revisar bujías', 'Cambiar bobina'],
  toolCalls: cognitiveToolCalls,
}

type ServiceStub = Pick<
  DiagnosisService,
  'isDirectConnection' | 'listScenarios' | 'diagnose' | 'cognitiveDiagnosis' | 'callMcpTool'
>

/** Stub de DiagnosisService: el controlador solo consume su superficie publica. */
function createServiceStub(overrides: Partial<ServiceStub> = {}): DiagnosisService {
  return {
    isDirectConnection: false,
    listScenarios: vi.fn(() => mockScenarios),
    diagnose: vi.fn(async () => diagnoseOutput),
    cognitiveDiagnosis: vi.fn(async () => cognitiveOutput),
    callMcpTool: vi.fn(async () => '750'),
    ...overrides,
  } as unknown as DiagnosisService
}

function createApp(service: DiagnosisService = createServiceStub()) {
  const app = express()
  app.use(express.json())
  const router = createDiagnosisRoutes(new DiagnosisController(service, mockLogger))
  app.use('/api', router)
  return { app, service }
}

describe('diagnosisRoutes', () => {
  describe('GET /api/scenarios', () => {
    it('should return the list of scenarios from the service', async () => {
      const { app } = createApp()
      const res = await request(app).get('/api/scenarios')

      expect(res.status).toBe(200)
      expect(res.body.scenarios).toHaveLength(2)
    })

    it('should return the synthetic tcp scenario in TCP mode', async () => {
      const service = createServiceStub({
        isDirectConnection: true,
        listScenarios: vi.fn(() => [tcpScenario]),
      })
      const { app } = createApp(service)
      const res = await request(app).get('/api/scenarios')

      expect(res.status).toBe(200)
      expect(res.body.scenarios).toHaveLength(1)
      expect(res.body.scenarios[0]).toMatchObject({ id: 'tcp' })
    })
  })

  describe('POST /api/diagnosis', () => {
    it('should return the diagnosis for a valid scenario', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)
      const res = await request(app).post('/api/diagnosis').send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(200)
      expect(service.diagnose).toHaveBeenCalledWith('audi-a3-idle')
      expect(res.body.severity).toBe('high')
      expect(res.body.parsedValues.rpm).toBe(750)
      expect(res.body.dtcCodes).toHaveLength(1)
      expect(res.body.diagnosisText).toBe('[HIGH] P0301')
    })

    it('should return 404 with DiagnosisScenarioNotFoundError', async () => {
      const service = createServiceStub({
        diagnose: vi.fn(async () => {
          throw new DiagnosisScenarioNotFoundError()
        }),
      })
      const { app } = createApp(service)
      const res = await request(app).post('/api/diagnosis').send({ scenarioId: 'nonexistent' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Scenario not found')
    })

    it('should return 400 for invalid body', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)
      const res = await request(app).post('/api/diagnosis').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
      expect(service.diagnose).not.toHaveBeenCalled()
    })

    it('should return 500 without leaking details on unexpected errors', async () => {
      const service = createServiceStub({
        diagnose: vi.fn(async () => {
          throw new Error('repo exploded')
        }),
      })
      const { app } = createApp(service)
      const res = await request(app).post('/api/diagnosis').send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
      expect(JSON.stringify(res.body)).not.toContain('repo exploded')
    })
  })

  describe('TCP mode (isDirectConnection)', () => {
    it('should run diagnosis without scenarioId and delegate to the service', async () => {
      const service = createServiceStub({ isDirectConnection: true })
      const { app } = createApp(service)
      const res = await request(app).post('/api/diagnosis').send({})

      expect(res.status).toBe(200)
      expect(service.diagnose).toHaveBeenCalledWith(undefined)
      expect(res.body.parsedValues.rpm).toBe(750)
      expect(res.body.severity).toBe('high')
    })

    it('should call MCP tools without scenarioId', async () => {
      const service = createServiceStub({ isDirectConnection: true })
      const { app } = createApp(service)
      const res = await request(app)
        .post('/api/mcp/tools/read_pid')
        .send({ args: { mode: '01', pid: '0C' } })

      expect(res.status).toBe(200)
      expect(res.body.result).toBe('750')
      expect(service.callMcpTool).toHaveBeenCalledWith('read_pid', undefined, {
        mode: '01',
        pid: '0C',
      })
    })
  })

  describe('POST /api/mcp/tools/:toolName', () => {
    it('should return the tool result for a valid request', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)
      const res = await request(app)
        .post('/api/mcp/tools/read_pid')
        .send({ scenarioId: 'audi-a3-idle', args: { mode: '01', pid: '0C' } })

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ tool: 'read_pid', result: '750' })
      expect(service.callMcpTool).toHaveBeenCalledWith('read_pid', 'audi-a3-idle', {
        mode: '01',
        pid: '0C',
      })
    })

    it('should return 404 when the tool does not exist', async () => {
      const service = createServiceStub({
        callMcpTool: vi.fn(async () => {
          throw new ToolNotFoundError('bogus_tool')
        }),
      })
      const { app } = createApp(service)
      const res = await request(app)
        .post('/api/mcp/tools/bogus_tool')
        .send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Tool not found: bogus_tool')
    })

    it('should return 504 when the tool call times out', async () => {
      const service = createServiceStub({
        callMcpTool: vi.fn(async () => {
          throw new ToolCallTimeoutError()
        }),
      })
      const { app } = createApp(service)
      const res = await request(app)
        .post('/api/mcp/tools/read_pid')
        .send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(504)
      expect(res.body.error).toBe('Tool call timed out')
    })

    it('should return 404 when the scenario does not exist', async () => {
      const service = createServiceStub({
        callMcpTool: vi.fn(async () => {
          throw new DiagnosisScenarioNotFoundError()
        }),
      })
      const { app } = createApp(service)
      const res = await request(app)
        .post('/api/mcp/tools/read_pid')
        .send({ scenarioId: 'no-existe' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Scenario not found')
    })

    it('should return 400 for invalid body', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)
      const res = await request(app).post('/api/mcp/tools/read_pid').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
      expect(service.callMcpTool).not.toHaveBeenCalled()
    })
  })

  describe('POST /api/mcp/cognitive-diagnosis', () => {
    it('should return a complete CognitiveDiagnosisResult', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: '¿Por qué tiembla el motor al ralentí?' })

      expect(res.status).toBe(200)
      expect(service.cognitiveDiagnosis).toHaveBeenCalledWith({
        scenarioId: 'audi-a3-idle',
        userQuery: '¿Por qué tiembla el motor al ralentí?',
      })
      expect(res.body.diagnosis).toBe(cognitiveText)
      expect(res.body.severity).toBe('high')
      expect(res.body.confidence).toBe(0.9)
      expect(res.body.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
      expect(res.body.toolCalls).toEqual(cognitiveToolCalls)
    })

    it('should return 404 when the scenario does not exist', async () => {
      const service = createServiceStub({
        cognitiveDiagnosis: vi.fn(async () => {
          throw new DiagnosisScenarioNotFoundError()
        }),
      })
      const { app } = createApp(service)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'no-existe' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Scenario not found')
    })

    it('should return 404 when cognitive diagnosis is unavailable', async () => {
      const service = createServiceStub({
        cognitiveDiagnosis: vi.fn(async () => {
          throw new CognitiveDiagnosisUnavailableError()
        }),
      })
      const { app } = createApp(service)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(404)
      expect(res.body.error).toBe('Cognitive diagnosis is not available')
    })

    it('should return 400 for an invalid body', async () => {
      const service = createServiceStub()
      const { app } = createApp(service)

      const res = await request(app).post('/api/mcp/cognitive-diagnosis').send({})

      expect(res.status).toBe(400)
      expect(res.body.error).toBe('Invalid request body')
      expect(service.cognitiveDiagnosis).not.toHaveBeenCalled()
    })

    it('should return 504 when the diagnosis exceeds the timeout', async () => {
      const service = createServiceStub({
        cognitiveDiagnosis: vi.fn(async () => {
          throw new CognitiveDiagnosisTimeoutError()
        }),
      })
      const { app } = createApp(service)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: 'x' })

      expect(res.status).toBe(504)
      expect(res.body.error).toBe('Cognitive diagnosis timed out')
    })

    it('should return 500 without leaking details when the LLM fails', async () => {
      const service = createServiceStub({
        cognitiveDiagnosis: vi.fn(async () => {
          throw new Error('llm internal explosion')
        }),
      })
      const { app } = createApp(service)

      const res = await request(app)
        .post('/api/mcp/cognitive-diagnosis')
        .send({ scenarioId: 'audi-a3-idle', query: 'x' })

      expect(res.status).toBe(500)
      expect(res.body.error).toBe('Internal server error')
      expect(JSON.stringify(res.body)).not.toContain('llm internal explosion')
    })
  })
})
