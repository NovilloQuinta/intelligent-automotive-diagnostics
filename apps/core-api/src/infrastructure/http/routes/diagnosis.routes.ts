import { Router } from 'express'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { ObdSimulator } from '@/infrastructure/obd/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/obd/simulatorAdapter.js'
import { processVehicleDiagnosis } from '@/application/use-cases/processVehicleDiagnosis.js'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { SimulationScenario } from '@/domain/simulationScenario.js'

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

interface DiagnosisRoutesDeps {
  readonly scenarios: SimulationScenario[]
}

/** Crea un Express Router con las rutas de diagnostico OBD. */
export function createDiagnosisRoutes(deps: DiagnosisRoutesDeps): Router {
  const { scenarios } = deps
  const router = Router()

  router.get('/scenarios', (_req: Request, res: Response) => {
    res.status(200).json({ scenarios })
  })

  router.post('/diagnosis', async (req: Request, res: Response) => {
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
  })

  router.post('/mcp/tools/:toolName', async (req: Request<{ toolName: string }>, res: Response) => {
    const paramsParsed = McpToolParamsSchema.safeParse(req.params)
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
    const mcp = createMcpServer(repository)

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
  })

  return router
}
