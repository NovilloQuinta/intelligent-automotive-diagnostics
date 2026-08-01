import { describe, it, expect, vi } from 'vitest'
import { executeCognitiveDiagnosis } from '@/application/use-cases/executeCognitiveDiagnosis.js'
import type {
  LlmClientPort,
  McpToolDefinition,
  ToolCallHandler,
  ToolCallTrace,
} from '@/application/ports/llmClient.port.js'
import { MaxToolCallIterationsError } from '@/application/ports/llmClient.port.js'
import { Severity } from '@/domain/diagnosisResult.js'
import type { VehicleInfo } from '@/domain/vehicleProfile.js'
import { Vin } from '@/domain/vin.js'

/** Las 6 tools del MCP Server (mismas que listTools devuelve en producción). */
const sixTools: McpToolDefinition[] = [
  { name: 'read_pid', description: 'Read an OBD-II PID value.', schema: { type: 'object' } },
  { name: 'get_dtc_codes', description: 'Read stored DTCs.', schema: { type: 'object' } },
  { name: 'get_freeze_frame', description: 'Get freeze frame data.', schema: { type: 'object' } },
  { name: 'read_vin', description: 'Read VIN.', schema: { type: 'object' } },
  { name: 'get_vehicle_info', description: 'Get vehicle info.', schema: { type: 'object' } },
  { name: 'get_available_pids', description: 'List known PIDs.', schema: { type: 'object' } },
]

const vehicleContext: VehicleInfo = {
  make: 'Audi',
  model: 'A3',
  year: 2018,
  engineType: '2.0 TFSI',
  vin: Vin.create('WAUZZZ8V5JA123456'),
}

function mockLlmClient(overrides: Partial<LlmClientPort> = {}): LlmClientPort {
  return {
    sendMessage: vi.fn(),
    ...overrides,
  }
}

/** Resultado LLM: narrativa + bloque ---JSON--- válido. */
function cognitiveResponse(
  text: string,
  toolCalls: ToolCallTrace[] = [],
): { text: string; toolCalls: ToolCallTrace[] } {
  return { text, toolCalls }
}

describe('executeCognitiveDiagnosis', () => {
  it('should call sendMessage with systemPrompt, userMessage, tools and handler', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })
    const handler: ToolCallHandler = vi.fn(async () => 'result')

    await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler,
      userQuery: '¿Por qué tiembla el motor al ralentí?',
      vehicleContext,
    })

    expect(llmClient.sendMessage).toHaveBeenCalledTimes(1)
    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.systemPrompt).toContain('diagnost')
    expect(input.tools).toBe(sixTools)
    expect(input.handler).toBe(handler)
    expect(input.userMessage).toContain('¿Por qué tiembla el motor al ralentí?')
    expect(input.userMessage).toContain('Audi')
    expect(input.userMessage).toContain('A3')
  })

  it('should forward a handler that bridges to mcpServer.callTool content text', async () => {
    const callTool = vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '750' }] })
    const handler: ToolCallHandler = async (name, args) => {
      const result = await callTool(name, args)
      return result.content[0].text
    }
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })

    await executeCognitiveDiagnosis({ llmClient, tools: sixTools, handler })

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.handler).toBe(handler)
    await expect(input.handler('read_pid', { mode: '01', pid: '0C' })).resolves.toBe('750')
    expect(callTool).toHaveBeenCalledWith('read_pid', { mode: '01', pid: '0C' })
  })

  it('should parse a valid ---JSON--- block into severity, confidence and recommendations', async () => {
    const text =
      'El motor falla en el cilindro 1. ---JSON---{"severity":"high","confidence":0.9,"recommendations":["Revisar bujías","Cambiar bobina"]}---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    expect(result.diagnosis).toBe(text)
    expect(result.severity).toBe(Severity.High)
    expect(result.confidence).toBe(0.9)
    expect(result.recommendations).toEqual(['Revisar bujías', 'Cambiar bobina'])
  })

  it('should fall back to defaults when the response has no ---JSON--- block', async () => {
    const text = 'Diagnóstico plano sin bloque estructurado.'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    expect(result.diagnosis).toBe(text)
    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should fall back to defaults when the ---JSON--- block is malformed', async () => {
    const text = 'Narrativa. ---JSON---{"severity": }---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    expect(result.diagnosis).toBe(text)
    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should fall back to defaults when confidence is out of range', async () => {
    const text = '---JSON---{"severity":"high","confidence":2,"recommendations":["x"]}---'
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse(text)),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    expect(result.severity).toBe(Severity.Medium)
    expect(result.confidence).toBe(0.5)
    expect(result.recommendations).toEqual([])
  })

  it('should propagate MaxToolCallIterationsError from sendMessage', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi
        .fn()
        .mockRejectedValue(
          new MaxToolCallIterationsError('Exceeded maximum tool call iterations (10).', []),
        ),
    })

    await expect(
      executeCognitiveDiagnosis({ llmClient, tools: sixTools, handler: vi.fn() }),
    ).rejects.toBeInstanceOf(MaxToolCallIterationsError)
  })

  it('should include toolCalls from the LLM session in the result', async () => {
    const toolCalls: ToolCallTrace[] = [
      { tool: 'read_pid', args: { mode: '01', pid: '0C' }, result: '750' },
      { tool: 'get_dtc_codes', args: {}, result: 'P0301: Cylinder 1 Misfire' },
    ]
    const llmClient = mockLlmClient({
      sendMessage: vi
        .fn()
        .mockResolvedValue(
          cognitiveResponse(
            'Narrativa ---JSON---{"severity":"low","confidence":0.8,"recommendations":[]}---',
            toolCalls,
          ),
        ),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    expect(result.toolCalls).toEqual(toolCalls)
  })

  it('should work without userQuery and vehicleContext', async () => {
    const llmClient = mockLlmClient({
      sendMessage: vi.fn().mockResolvedValue(cognitiveResponse('ok')),
    })

    const result = await executeCognitiveDiagnosis({
      llmClient,
      tools: sixTools,
      handler: vi.fn(),
    })

    const input = (llmClient.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(input.userMessage).toBeTruthy()
    expect(result.diagnosis).toBe('ok')
  })
})
