import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Vin } from '@/domain/value-objects/vin.js'
import { VehicleType, type SimulationScenario } from '@/infrastructure/simulation/scenario.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { ToolCallHandler } from '@/application/ports/ToolCallHandler.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * Una tool MCP que devuelve `content: []` hacia leer `content[0].text` provoca
 * hoy un `TypeError` opaco. Estos tests exigen un error de dominio explicito.
 *
 * Vive en su propio fichero porque `vi.mock` se eleva al modulo entero y el
 * resto de tests de `DiagnosisService` necesitan el servidor MCP real.
 */
vi.mock('@/infrastructure/mcp/mcpServer.js', () => ({
  createMcpServer: () => ({
    server: {},
    listTools: () => [],
    callTool: () => Promise.resolve({ content: [] }),
  }),
}))

const { DiagnosisService, EmptyToolResultError } =
  await import('@/infrastructure/services/diagnosisService.js')

const scenario: SimulationScenario = {
  id: 'audi-a3-idle',
  name: 'Audi A3 al ralenti',
  vehicleType: VehicleType.Car,
  sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
  dtcConfig: [],
  vehicleInfo: {
    make: 'Audi',
    model: 'A3',
    year: 2018,
    engineType: '2.0 TFSI',
    vin: new Vin('WAUZZZ8V5JA123456'),
  },
}

function createMockLogger(): LoggerPort {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as LoggerPort
}

describe('DiagnosisService with an MCP tool returning empty content', () => {
  let logger: LoggerPort

  beforeEach(() => {
    logger = createMockLogger()
  })

  it('callMcpTool should throw EmptyToolResultError instead of a TypeError', async () => {
    const service = new DiagnosisService({ scenarios: [scenario], logger })

    await expect(service.callMcpTool('read_pid', 'audi-a3-idle')).rejects.toThrow(
      EmptyToolResultError,
    )
  })

  it('EmptyToolResultError should name the offending tool', async () => {
    const service = new DiagnosisService({ scenarios: [scenario], logger })

    await expect(service.callMcpTool('read_pid', 'audi-a3-idle')).rejects.toThrow(/read_pid/)
  })

  it('the cognitive tool handler should also reject with EmptyToolResultError', async () => {
    const llmClient = {
      sendMessage: vi.fn(async (_input: unknown, handler: ToolCallHandler) => {
        await handler('read_pid', {})
        return { text: 'unreachable', toolCalls: [] }
      }),
      sendSingleMessage: vi.fn(),
    } as unknown as LlmClientPort

    const service = new DiagnosisService({
      scenarios: [scenario],
      llmClient,
      logger,
    })

    await expect(service.cognitiveDiagnosis({ scenarioId: 'audi-a3-idle' })).rejects.toThrow(
      EmptyToolResultError,
    )
  })
})
