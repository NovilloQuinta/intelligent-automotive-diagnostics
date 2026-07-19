import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObdRepository } from '@/application/ports/obdRepository.interface.js'
import type { VehicleRepository } from '@/application/ports/vehicleRepository.interface.js'

/** Resultado de invocar una tool MCP. */
export interface ToolCallResult {
  content: Array<{ type: string; text: string }>
}

/** Tool handler: firma de una función que procesa una tool MCP. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>

/** Servidor MCP con tools de diagnóstico OBD-II, expuesto para uso in-process. */
export interface DiagnosticsMcpServer {
  /** El servidor MCP subyacente (para transporte stdio/HTTP). */
  readonly server: McpServer
  /** Invoca una tool directamente sin transporte (para tests). */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>
}

/** Crea un servidor MCP con tools de diagnóstico OBD-II.
 * Capa 1: tools sobre {@link ObdRepository} (hardware).
 * Capa 2: tools sobre {@link VehicleRepository} (catálogo).
 */
export function createMcpServer(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository,
): DiagnosticsMcpServer {
  const server = new McpServer({
    name: 'obd-diagnostics',
    version: '0.2.0',
  })

  // Registro de handlers testeables
  const handlers: Record<string, ToolHandler> = {}

  server.tool(
    'read_pid',
    'Read an OBD-II PID value. Mode 01 for standard PIDs, 22 for manufacturer-specific.',
    { mode: z.string(), pid: z.string() },
    (handlers['read_pid'] = async ({ mode, pid }) => {
      const value = await repo.readPid(mode as string, pid as string)
      return { content: [{ type: 'text' as const, text: String(value) }] }
    }),
  )

  server.tool(
    'get_dtc_codes',
    'Read stored Diagnostic Trouble Codes (Service 03).',
    {},
    (handlers['get_dtc_codes'] = async () => {
      const dtcs = await repo.readDtcCodes()
      if (dtcs.length === 0)
        return { content: [{ type: 'text' as const, text: 'No DTC codes detected.' }] }
      const text = dtcs.map((d) => `${d.code}: ${d.description || 'no description'}`).join('\n')
      return { content: [{ type: 'text' as const, text }] }
    }),
  )

  server.tool(
    'get_freeze_frame',
    'Get freeze frame data (Service 02).',
    { dtc: z.string().optional() },
    (handlers['get_freeze_frame'] = async ({ dtc }) => {
      const frame = await repo.getFreezeFrame(dtc as string | undefined)
      if (!frame)
        return { content: [{ type: 'text' as const, text: 'No freeze frame data available.' }] }
      const values = Object.entries(frame.pidValues)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return {
        content: [{ type: 'text' as const, text: `DTC ${frame.dtcCode} freeze frame: ${values}` }],
      }
    }),
  )

  server.tool(
    'read_vin',
    'Read VIN (Service 09 PID 02).',
    {},
    (handlers['read_vin'] = async () => {
      const vin = await repo.readVin()
      return { content: [{ type: 'text' as const, text: vin }] }
    }),
  )

  server.tool(
    'get_vehicle_info',
    'Get vehicle make, model, year, engine.',
    {},
    (handlers['get_vehicle_info'] = async () => {
      const info = await repo.getVehicleInfo()
      return {
        content: [
          {
            type: 'text' as const,
            text: `${info.make} ${info.model} (${info.year}) — ${info.engineType}`,
          },
        ],
      }
    }),
  )

  server.tool(
    'get_available_pids',
    'List known PIDs for a vehicle.',
    { vehicleId: z.number().optional() },
    (handlers['get_available_pids'] = async ({ vehicleId }) => {
      const pids = vehicleId != null ? await vehicleRepo.findPidsByVehicle(vehicleId as number) : []
      if (pids.length === 0)
        return { content: [{ type: 'text' as const, text: 'No PIDs available for this vehicle.' }] }
      const text = pids
        .map((p) => `${p.mode} ${p.pidCode}: ${p.name} (${p.formula}) [${p.unit ?? ''}]`)
        .join('\n')
      return { content: [{ type: 'text' as const, text }] }
    }),
  )

  return {
    server,
    callTool: (name, args) => {
      const handler = handlers[name]
      if (!handler) throw new Error(`Tool not found: ${name}`)
      return handler(args)
    },
  }
}
