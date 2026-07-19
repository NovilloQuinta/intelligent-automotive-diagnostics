import { z } from 'zod'
import { ObdSimulator } from '@/infrastructure/hardware-simulator/obdSimulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/hardware-simulator/obdSimulatorRepository.js'
import { processVehicleDiagnosis } from '@/application/diagnostics/processVehicleDiagnosis.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { VehicleRepository } from '@/application/ports/vehicleRepository.interface.js'
import type { ServerConfig } from '@/infrastructure/http/server.js'

const DiagnosisBodySchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
})

const McpToolBodySchema = z.object({
  scenarioId: z.string().min(1, 'scenarioId is required'),
  args: z.record(z.unknown()).default({}),
})

const McpToolParamsSchema = z.object({
  toolName: z.string().min(1),
})

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

  const emptyVehicleRepo: VehicleRepository = {
    upsertVehicle: async () => ({ vin: '', make: '', model: '', year: 0, engineType: '' }),
    findVehicleByVin: async () => null,
    insertEcu: async () => ({
      vehicleId: 0,
      name: '',
      requestAddr: '',
      responseAddr: '',
      type: 'OTHER',
      protocol: '',
    }),
    findEcusByVehicle: async () => [],
    insertPidDefinition: async () => ({
      mode: '',
      pidCode: '',
      name: '',
      formula: '',
      dataBytes: 1,
      pidType: 'formula',
      confidence: 0,
      source: 'manual',
    }),
    findPidDefinition: async () => null,
    findPidsByVehicle: async () => [],
    insertPidReading: async () => ({ sessionId: '', rawHex: '' }),
    createSession: async () => ({ vehicleId: 0 }),
    endSession: async () => {},
  }

  return {
    getScenarios(_req: ExpressRequest, res: ExpressResponse) {
      res.status(200).json({ scenarios })
    },

    async runDiagnosis(req: ExpressRequest, res: ExpressResponse) {
      const parsed = DiagnosisBodySchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request body', details: parsed.error.issues })
        return
      }

      const { scenarioId } = parsed.data
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

    async runMcpTool(
      req: ExpressRequest & { params?: Record<string, string> },
      res: ExpressResponse,
    ) {
      const paramsParsed = McpToolParamsSchema.safeParse(req.params ?? {})
      if (!paramsParsed.success) {
        res.status(400).json({ error: 'Invalid tool name', details: paramsParsed.error.issues })
        return
      }

      const bodyParsed = McpToolBodySchema.safeParse(req.body)
      if (!bodyParsed.success) {
        res.status(400).json({ error: 'Invalid request body', details: bodyParsed.error.issues })
        return
      }

      const { toolName } = paramsParsed.data
      const { scenarioId, args } = bodyParsed.data

      const scenario = scenarios.find((s) => s.id === scenarioId)
      if (!scenario) {
        res.status(404).json({ error: 'Scenario not found' })
        return
      }

      const simulator = new ObdSimulator(scenario)
      const repository = new ObdSimulatorRepository(simulator)
      const mcp = createMcpServer(repository, emptyVehicleRepo)

      try {
        const result = await mcp.callTool(toolName, args)
        res.status(200).json({ tool: toolName, result: result.content[0].text })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        if (message.includes('Tool not found')) {
          res.status(404).json({ error: `Tool not found: ${toolName}` })
        } else {
          res.status(500).json({ error: message })
        }
      }
    },
  }
}
