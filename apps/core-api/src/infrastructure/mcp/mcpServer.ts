import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObdRepositoryPort } from '@/application/ports/obdRepository.port.js'
import type { VehicleRepositoryPort } from '@/application/ports/vehicleRepository.port.js'
import type { McpToolDefinition } from '@/application/ports/llmClient.port.js'

/** Resultado de invocar una tool MCP (siempre contenido de tipo texto). */
export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>
}

/** Tool handler: firma de una función que procesa una tool MCP. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>

/** Servidor MCP con tools de diagnóstico OBD-II, expuesto para uso in-process. */
export interface DiagnosticsMcpServer {
  /** El servidor MCP subyacente (para transporte stdio/HTTP). */
  readonly server: McpServer
  /** Invoca una tool directamente sin transporte (para tests). */
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>
  /** Devuelve las definiciones (name, description, schema) de las tools registradas. */
  listTools(): McpToolDefinition[]
}

/** Convierte un ZodTypeAny a su tipo JSON Schema primitivo (string/number/boolean). */
function zodPrimitiveType(schema: z.ZodTypeAny): string | undefined {
  const inner =
    schema._def.typeName === 'ZodOptional'
      ? (schema as z.ZodOptional<z.ZodTypeAny>)._def.innerType
      : schema
  switch (inner._def.typeName) {
    case 'ZodString':
      return 'string'
    case 'ZodNumber':
      return 'number'
    case 'ZodBoolean':
      return 'boolean'
    default:
      return undefined
  }
}

/** Convierte un ZodRawShape a JSON Schema de objeto (subconjunto mínimo: primitivos + opcional). */
function shapeToJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const type = zodPrimitiveType(field)
    properties[key] = type ? { type } : {}
    if (!field.isOptional()) required.push(key)
  }
  return { type: 'object', properties, required }
}

/** Callback de registro de una tool (inyectado por createMcpServer). */
type ToolRegistrar = (
  name: string,
  description: string,
  shape: Record<string, z.ZodTypeAny>,
  handler: ToolHandler,
) => void

/** Registra las 6 tools de diagnóstico OBD-II sobre el repositorio inyectado. */
function registerDiagnosticTools(
  register: ToolRegistrar,
  repo: ObdRepositoryPort,
  vehicleRepo: VehicleRepositoryPort | undefined,
): void {
  register(
    'read_pid',
    'Read an OBD-II PID value. Mode 01 for standard PIDs, 22 for manufacturer-specific.',
    { mode: z.string(), pid: z.string() },
    async ({ mode, pid }) => {
      const value = await repo.readPid(mode as string, pid as string)
      return { content: [{ type: 'text' as const, text: String(value) }] }
    },
  )

  register('get_dtc_codes', 'Read stored Diagnostic Trouble Codes (Service 03).', {}, async () => {
    const dtcs = await repo.readDtcCodes()
    if (dtcs.length === 0)
      return { content: [{ type: 'text' as const, text: 'No DTC codes detected.' }] }
    const text = dtcs.map((d) => `${d.code}: ${d.description || 'no description'}`).join('\n')
    return { content: [{ type: 'text' as const, text }] }
  })

  register(
    'get_freeze_frame',
    'Get freeze frame data (Service 02).',
    { dtc: z.string().optional() },
    async ({ dtc }) => {
      const frame = await repo.getFreezeFrame(dtc as string | undefined)
      if (!frame)
        return { content: [{ type: 'text' as const, text: 'No freeze frame data available.' }] }
      const values = Object.entries(frame.pidValues)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ')
      return {
        content: [{ type: 'text' as const, text: `DTC ${frame.dtcCode} freeze frame: ${values}` }],
      }
    },
  )

  register('read_vin', 'Read VIN (Service 09 PID 02).', {}, async () => {
    const vin = await repo.readVin()
    return { content: [{ type: 'text' as const, text: vin }] }
  })

  register('get_vehicle_info', 'Get vehicle make, model, year, engine.', {}, async () => {
    const info = await repo.getVehicleInfo()
    return {
      content: [
        {
          type: 'text' as const,
          text: `${info.make} ${info.model} (${info.year}) — ${info.engineType}`,
        },
      ],
    }
  })

  register(
    'get_available_pids',
    'List known PIDs for a vehicle.',
    { vehicleId: z.number().optional() },
    async ({ vehicleId }) => {
      if (!vehicleRepo) {
        return { content: [{ type: 'text' as const, text: 'No PIDs available for this vehicle.' }] }
      }
      const pids = vehicleId != null ? await vehicleRepo.findPidsByVehicle(vehicleId as number) : []
      if (pids.length === 0)
        return { content: [{ type: 'text' as const, text: 'No PIDs available for this vehicle.' }] }
      const text = pids
        .map(
          (p) => `${p.pidCode.mode} ${p.pidCode.pid}: ${p.name} (${p.formula}) [${p.unit ?? ''}]`,
        )
        .join('\n')
      return { content: [{ type: 'text' as const, text }] }
    },
  )
}

/** Crea un servidor MCP con tools de diagnóstico OBD-II.
 * Capa 1: tools sobre {@link ObdRepositoryPort} (hardware).
 * Capa 2: tools sobre {@link VehicleRepositoryPort} (catálogo).
 */
export function createMcpServer(
  repo: ObdRepositoryPort,
  vehicleRepo?: VehicleRepositoryPort,
): DiagnosticsMcpServer {
  const server = new McpServer({
    name: 'obd-diagnostics',
    version: '0.2.0',
  })

  // Registro de handlers testeables
  const handlers: Record<string, ToolHandler> = {}
  // Definiciones de tools registradas (fuente de verdad de listTools)
  const toolDefinitions: McpToolDefinition[] = []

  /** Registra una tool en el servidor MCP y guarda su definición para listTools. */
  function registerTool(
    name: string,
    description: string,
    shape: Record<string, z.ZodTypeAny>,
    handler: ToolHandler,
  ): void {
    handlers[name] = handler
    toolDefinitions.push({ name, description, schema: shapeToJsonSchema(shape) })
    // Normaliza el resultado a TextContent (CallToolResult del SDK exige type literal 'text')
    server.tool(name, description, shape, async (args) => {
      const result = await handler(args)
      return { content: result.content.map((c) => ({ type: 'text' as const, text: c.text })) }
    })
  }

  registerDiagnosticTools(registerTool, repo, vehicleRepo)

  return {
    server,
    callTool: (name, args) => {
      const handler = handlers[name]
      if (!handler) throw new Error(`Tool not found: ${name}`)
      return handler(args)
    },
    listTools: () => toolDefinitions,
  }
}
