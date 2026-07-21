import { describe, it, expect } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import type { SimulationScenario } from '@/domain/simulationScenario.js'

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralenti',
    vehicleType: 'car',
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
    vehicleInfo: { make: 'Audi', model: 'A3', year: 2018, engineType: '2.0 TFSI', vin: 'WAUZZZ8V5JA123456' },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
    vehicleInfo: { make: 'Kawasaki', model: 'Z900', year: 2020, engineType: '948cc Inline-4', vin: 'JKAZR2A1XLA000111' },
  },
]

function createApp() {
  const app = express()
  app.use(express.json())
  const router = createDiagnosisRoutes({ scenarios: mockScenarios })
  app.use('/api', router)
  return app
}

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
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ scenarioId: 'audi-a3-idle' })

      expect(res.status).toBe(200)
      expect(res.body.severity).toBe('high')
      expect(res.body.parsedValues.rpm).toBe(750)
      expect(res.body.dtcCodes).toHaveLength(1)
    })

    it('should return 404 for an unknown scenario', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/diagnosis')
        .send({ scenarioId: 'nonexistent' })

      expect(res.status).toBe(404)
    })

    it('should return 400 for invalid body', async () => {
      const app = createApp()
      const res = await request(app)
        .post('/api/diagnosis')
        .send({})

      expect(res.status).toBe(400)
    })
  })
})
