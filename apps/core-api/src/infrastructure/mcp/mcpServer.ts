import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import {
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/errors.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'

/** Resultado de invocar una tool MCP (siempre contenido de tipo texto). */
export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>
  isError?: boolean
}

/** Tool handler: firma de una funcion que procesa una tool MCP. */
export type ToolHandler = (args: Record<string, unknown>) => Promise<ToolCallResult>

/** Servidor MCP con tools de diagnostico OBD-II, expuesto para uso in-process. */
export interface DiagnosticsMcpServer {
  readonly server: McpServer
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>
  listTools(): McpToolDefinition[]
}

/** Categoria de error MCP segun best practices: permite al LLM decidir si reintentar. */
type ToolErrorCategory = 'client_error' | 'server_error' | 'external_error'

const MCP_SERVER_NAME = 'obd-diagnostics'
const MCP_SERVER_VERSION = '0.2.0'

/** Crea un bloque de texto para el contenido de una tool MCP. */
function text(content: string): ToolCallResult {
  return { content: [{ type: 'text' as const, text: content }] }
}

/**
 * Convierte un ZodTypeAny a su tipo JSON Schema primitivo (string/number/boolean).
 *
 * Usa `instanceof` y `unwrap()`, ambos API publica. La version anterior leia
 * `schema._def.typeName`, un interno de Zod cuya forma cambio entre versiones
 * mayores: al romperse devolvia `undefined` y cada propiedad degradaba a `{}`
 * en silencio, sin que el compilador ni los tests avisaran.
 */
function zodPrimitiveType(schema: z.ZodTypeAny): string | undefined {
  const inner = schema instanceof z.ZodOptional ? schema.unwrap() : schema
  if (inner instanceof z.ZodString) return 'string'
  if (inner instanceof z.ZodNumber) return 'number'
  if (inner instanceof z.ZodBoolean) return 'boolean'
  return undefined
}

/** Convierte un ZodRawShape a JSON Schema de objeto (subconjunto mínimo: primitivos + opcional). */
function shapeToJsonSchema(shape: Record<string, z.ZodTypeAny>): Record<string, unknown> {
  /** Tipo no representable en el subconjunto soportado: se deja sin restringir. */
  const UNCONSTRAINED = {}
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const [key, field] of Object.entries(shape)) {
    const type = zodPrimitiveType(field)
    properties[key] = type ? { type } : UNCONSTRAINED
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

/** Clasifica un error de tool para que el LLM pueda decidir si merece la pena reintentar. */
function categorizeError(err: unknown): ToolErrorCategory {
  if (err instanceof Elm327ConnectionError) return 'external_error'
  if (err instanceof Elm327NoDataError) return 'client_error'
  if (err instanceof Elm327ParseError) return 'server_error'
  return 'server_error'
}

/** Envuelve un handler para convertir excepciones en errores de ejecución MCP categorizados. */
function withErrorHandling(handler: ToolHandler): ToolHandler {
  return async (args) => {
    try {
      return await handler(args)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      return errorText(`[${categorizeError(err)}] ${message}`)
    }
  }
}

/** Envuelve un mensaje de error como resultado de tool marcado con `isError`. */
function errorText(message: string): ToolCallResult {
  return { ...text(message), isError: true }
}

// ─── Handlers ───────────────────────────────────────────────────────────────

function handleReadPid(repo: ObdRepository): ToolHandler {
  return async ({ mode, pid }) => text(String(await repo.readPid(`${mode}`, `${pid}`)))
}

function handleGetDtcCodes(repo: ObdRepository): ToolHandler {
  return async () => {
    const dtcs = await repo.readDtcCodes()
    if (dtcs.length === 0) return text('No DTC codes detected.')
    return text(dtcs.map((d) => `${d.code}: ${d.description || 'no description'}`).join('\n'))
  }
}

function handleGetFreezeFrame(repo: ObdRepository): ToolHandler {
  return async ({ dtc }) => {
    const frame = await repo.getFreezeFrame(dtc as string | undefined)
    if (!frame) return text('No freeze frame data available.')
    const values = Object.entries(frame.pidValues)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    return text(`DTC ${frame.dtcCode} freeze frame: ${values}`)
  }
}

function handleReadVin(repo: ObdRepository): ToolHandler {
  return async () => text(await repo.readVin())
}

function handleGetVehicleInfo(repo: ObdRepository): ToolHandler {
  return async () => {
    const info = await repo.getVehicleInfo()
    return text(`${info.make} ${info.model} (${info.year}) — ${info.engineType}`)
  }
}

function handleGetEcuInfo(repo: ObdRepository): ToolHandler {
  return async () => {
    const ecus = await repo.getEcuInfo()
    if (ecus.length === 0) return text('No ECUs discovered.')
    return text(
      ecus
        .map(
          (e) =>
            `${e.name} (${e.type}, ${e.requestAddr}→${e.responseAddr}) — ${e.protocol}`,
        )
        .join('\n'),
    )
  }
}

function handleGetAvailablePids(vehicleRepo: VehicleRepository | undefined): ToolHandler {
  return async ({ vehicleId }) => {
    // Sin repositorio o sin resultados no hay fallo: es una respuesta vacia
    // legitima, igual que en `get_dtc_codes`. Solo las excepciones son isError.
    if (!vehicleRepo) return text('No PIDs available for this vehicle.')
    const pids = vehicleId != null ? await vehicleRepo.findPidsByVehicle(vehicleId as number) : []
    if (pids.length === 0) return text('No PIDs available for this vehicle.')
    return text(
      pids
        .map(
          (p) =>
            `${p.pidCode.mode} ${p.pidCode.pid}: ${p.name} (${p.formula.toString()}) [${p.unit ?? ''}]`,
        )
        .join('\n'),
    )
  }
}

/** Registra las tools de diagnostico OBD-II sobre el repositorio inyectado. */
function registerDiagnosticTools(
  register: ToolRegistrar,
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
): void {
  register(
    'read_pid',
    'Read an OBD-II PID value. Mode 01, 22 for manufacturer-specific.',
    { mode: z.string(), pid: z.string() },
    withErrorHandling(handleReadPid(repo)),
  )
  register(
    'get_dtc_codes',
    'Read stored Diagnostic Trouble Codes (Service 03).',
    {},
    withErrorHandling(handleGetDtcCodes(repo)),
  )
  register(
    'get_freeze_frame',
    'Get freeze frame data (Service 02).',
    { dtc: z.string().optional() },
    withErrorHandling(handleGetFreezeFrame(repo)),
  )
  register('read_vin', 'Read VIN (Service 09 PID 02).', {}, withErrorHandling(handleReadVin(repo)))
  register(
    'get_vehicle_info',
    'Get vehicle make, model, year, engine.',
    {},
    withErrorHandling(handleGetVehicleInfo(repo)),
  )
  register(
    'get_available_pids',
    'List known PIDs for a vehicle.',
    { vehicleId: z.number().optional() },
    withErrorHandling(handleGetAvailablePids(vehicleRepo)),
  )
  register(
    'get_ecu_info',
    'List discovered ECUs (names, CAN addresses, protocol).',
    {},
    withErrorHandling(handleGetEcuInfo(repo)),
  )
}

/** Crea un servidor MCP con tools de diagnostico OBD-II. */
export function createMcpServer(
  repo: ObdRepository,
  vehicleRepo?: VehicleRepository,
): DiagnosticsMcpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  })

  const handlers: Record<string, ToolHandler> = {}
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
    server.tool(name, description, shape, async (args) => {
      const result = await handler(args)
      // `isError` viaja junto al contenido: sin el, un cliente MCP externo lee
      // los fallos como exitos.
      return {
        content: result.content.map((c) => ({ type: 'text' as const, text: c.text })),
        isError: result.isError ?? false,
      }
    })
  }

  registerDiagnosticTools(registerTool, repo, vehicleRepo)

  return {
    server,
    // `async` a proposito: la firma promete una Promise, y un throw sincrono
    // se escaparia de cualquier llamante que use `.catch()` sin try/catch.
    callTool: async (name, args) => {
      const handler = handlers[name]
      if (!handler) throw new ToolNotFoundError(name)
      return handler(args)
    },
    listTools: () => toolDefinitions,
  }
}
