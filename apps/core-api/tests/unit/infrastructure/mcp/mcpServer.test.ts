import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import { mockObdRepo, mockVehicleRepo } from './mcpTestFactories.js'

describe('McpServer — composicion y contrato', () => {
  describe('listTools', () => {
    it('should return 7 definitions with name, description and schema', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const tools = mcp.listTools()

      expect(tools).toHaveLength(7)
      for (const tool of tools) {
        expect(tool.name).toBeTruthy()
        expect(tool.description).toBeTruthy()
        expect(tool.schema).toEqual(expect.objectContaining({ type: 'object' }))
      }
    })

    it('should expose exactly the registered tool names', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const names = mcp.listTools().map((t) => t.name)

      expect(names).toEqual([
        'read_pid',
        'get_dtc_codes',
        'get_freeze_frame',
        'read_vin',
        'get_vehicle_info',
        'get_available_pids',
        'get_ecu_info',
      ])
    })

    it('should describe read_pid schema with mode and pid properties', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const readPid = mcp.listTools().find((t) => t.name === 'read_pid')

      expect(readPid?.schema).toEqual({
        type: 'object',
        properties: { mode: { type: 'string' }, pid: { type: 'string' } },
        required: ['mode', 'pid'],
      })
    })

    it('should mark optional schema fields as not required', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      const freezeFrame = mcp.listTools().find((t) => t.name === 'get_freeze_frame')

      expect(freezeFrame?.schema).toEqual({
        type: 'object',
        properties: { dtc: { type: 'string' } },
        required: [],
      })
    })
  })

  describe('isError propagation', () => {
    it('an empty result is not an error: PIDs with catalog fallback is legitimate', async () => {
      const mcp = createMcpServer(mockObdRepo(), undefined)

      const result = await mcp.callTool('get_available_pids', {})

      expect(result.isError).toBeFalsy()
      expect(result.content[0].text).toContain('01 0C')
    })

    it('a throwing handler should also be reported as isError', async () => {
      const repo = mockObdRepo({
        readDtcCodes: vi.fn().mockRejectedValue(new Error('bus off')),
      })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_dtc_codes', {})

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('bus off')
    })
  })

  describe('JSON Schema built with public Zod API', () => {
    it('should map string, number, boolean and optional without reading _def', () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())
      const byName = Object.fromEntries(mcp.listTools().map((t) => [t.name, t.schema]))

      expect(byName.read_pid).toMatchObject({
        type: 'object',
        properties: { mode: { type: 'string' }, pid: { type: 'string' } },
        required: ['mode', 'pid'],
      })
      expect(byName.get_available_pids).toMatchObject({
        properties: {},
        required: [],
      })
      expect(byName.get_freeze_frame).toMatchObject({
        properties: { dtc: { type: 'string' } },
        required: [],
      })
    })
  })

  describe('Edge cases', () => {
    it('should reject with a typed ToolNotFoundError when calling unknown tool', async () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      // Rechaza, no lanza en sincrono: la firma promete una Promise y un throw
      // sincrono se escaparia de un llamante que use `.catch()`.
      await expect(mcp.callTool('nonexistent_tool', {})).rejects.toThrow(ToolNotFoundError)
    })

    it('ToolNotFoundError should carry the tool name as a field, not only in the message', async () => {
      const mcp = createMcpServer(mockObdRepo(), mockVehicleRepo())

      await expect(mcp.callTool('nonexistent_tool', {})).rejects.toMatchObject({
        toolName: 'nonexistent_tool',
      })
    })

    it('get_dtc_codes should return message when no DTCs present', async () => {
      const repo = mockObdRepo({ readDtcCodes: vi.fn().mockResolvedValue([]) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_dtc_codes', {})

      expect(result.content[0].text).toBe('No DTC codes detected.')
    })

    it('get_freeze_frame should return message for unknown DTC', async () => {
      const repo = mockObdRepo({ getFreezeFrame: vi.fn().mockResolvedValue(null) })
      const mcp = createMcpServer(repo, mockVehicleRepo())

      const result = await mcp.callTool('get_freeze_frame', { dtc: 'INVALID' })

      expect(result.content[0].text).toContain('No freeze frame')
    })
  })
})
