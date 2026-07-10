import { describe, it, expect, vi } from 'vitest'
import { createDiagnosisController } from '@/infrastructure/http/controllers/diagnosisController.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'

function makeReq(body?: unknown) {
  return { body: body ?? {} } as ReturnType<typeof vi.fn> & { body: unknown }
}

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  }
  return res as unknown as ReturnType<typeof vi.fn> & {
    status: ReturnType<typeof vi.fn>
    json: ReturnType<typeof vi.fn>
  }
}

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: 'car',
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
  },
]

describe('diagnosisController', () => {
  describe('getScenarios', () => {
    it('should return the list of scenarios', () => {
      const controller = createDiagnosisController(mockScenarios)
      const req = makeReq()
      const res = makeRes()

      controller.getScenarios(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith({ scenarios: mockScenarios })
    })
  })

  describe('runDiagnosis', () => {
    it('should run diagnosis for a valid scenario', async () => {
      const controller = createDiagnosisController(mockScenarios)
      const req = makeReq({ scenarioId: 'audi-a3-idle' })
      const res = makeRes()

      await controller.runDiagnosis(req, res)

      expect(res.status).toHaveBeenCalledWith(200)
      const diagnosisArg = res.json.mock.calls[0][0]
      expect(diagnosisArg.severity).toBe('critical')
      expect(diagnosisArg.parsedValues.rpm).toBe(750)
      expect(diagnosisArg.dtcCodes).toHaveLength(1)
    })

    it('should return 404 for an unknown scenario', async () => {
      const controller = createDiagnosisController(mockScenarios)
      const req = makeReq({ scenarioId: 'nonexistent' })
      const res = makeRes()

      await controller.runDiagnosis(req, res)

      expect(res.status).toHaveBeenCalledWith(404)
      expect(res.json).toHaveBeenCalledWith({ error: 'Scenario not found' })
    })
  })
})
