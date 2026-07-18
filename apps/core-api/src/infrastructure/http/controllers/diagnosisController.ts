import { ObdSimulator } from '@/infrastructure/hardware-simulator/obdSimulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/hardware-simulator/obdSimulatorRepository.js'
import { processVehicleDiagnosis } from '@/application/diagnostics/processVehicleDiagnosis.js'
import type { ServerConfig } from '@/infrastructure/http/server.js'

interface ExpressRequest {
  body: unknown
}

interface ExpressResponse {
  status(code: number): ExpressResponse
  json(data: unknown): ExpressResponse
}

/** Factory que devuelve los handlers del controlador de diagnóstico. */
export function createDiagnosisController(config: ServerConfig) {
  const { scenarios } = config

  return {
    getScenarios(_req: ExpressRequest, res: ExpressResponse) {
      res.status(200).json({ scenarios })
    },

    async runDiagnosis(req: ExpressRequest, res: ExpressResponse) {
      const { scenarioId } = req.body as { scenarioId?: string }
      const scenario = scenarios.find((s) => s.id === scenarioId)

      if (!scenario) {
        res.status(404).json({ error: 'Scenario not found' })
        return
      }

      const simulator = new ObdSimulator(scenario)
      const repository = new ObdSimulatorRepository(simulator)
      const result = await processVehicleDiagnosis(repository)

      res.status(200).json(result)
    },
  }
}
