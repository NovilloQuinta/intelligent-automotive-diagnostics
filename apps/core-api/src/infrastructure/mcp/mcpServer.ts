import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { KnowledgeStackPort } from '@/application/ports/KnowledgeStackPort.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import { createWebSearchBudget } from '@/infrastructure/mcp/webSearchBudget.js'
import {
  shapeToJsonSchema,
  type ToolCallResult,
  type ToolHandler,
  type ToolRegistrar,
} from '@/infrastructure/mcp/mcpToolkit.js'
import {
  registerDiagnosticTools,
  type SessionContext,
} from '@/infrastructure/mcp/diagnosticTools.js'
import { registerKnowledgeTools } from '@/infrastructure/mcp/knowledgeTools.js'
import { registerWebSearchTool } from '@/infrastructure/mcp/webSearchTool.js'

/**
 * Primitivas de tool re-exportadas desde `mcpToolkit`: el contrato publico del
 * MCP sigue siendo este fichero, aunque la implementacion viva en su modulo.
 */
export type { ToolCallResult, ToolHandler } from '@/infrastructure/mcp/mcpToolkit.js'

/** Contexto de sesion re-exportado desde `diagnosticTools`, donde se consume. */
export type { SessionContext } from '@/infrastructure/mcp/diagnosticTools.js'

/** Servidor MCP con tools de diagnostico OBD-II, expuesto para uso in-process. */
export interface DiagnosticsMcpServer {
  readonly server: McpServer
  callTool(name: string, args: Record<string, unknown>): Promise<ToolCallResult>
  listTools(): McpToolDefinition[]
}

const MCP_SERVER_NAME = 'obd-diagnostics'
const MCP_SERVER_VERSION = '0.2.0'

/** Registro de tools: acumula handlers y definiciones mientras las inscribe en el servidor MCP. */
interface ToolRegistry {
  readonly register: ToolRegistrar
  readonly handlers: Record<string, ToolHandler>
  readonly definitions: McpToolDefinition[]
}

/**
 * Crea el registro de tools sobre un servidor MCP.
 *
 * Separado de {@link createMcpServer} porque es la unica logica de este modulo:
 * el resto es composicion. Mantener el closure dentro hacia que la funcion de
 * composicion pasara de 40 lineas escondiendo este mecanismo.
 */
function createToolRegistry(server: McpServer): ToolRegistry {
  const handlers: Record<string, ToolHandler> = {}
  const definitions: McpToolDefinition[] = []

  const register: ToolRegistrar = (name, description, shape, handler) => {
    handlers[name] = handler
    definitions.push({ name, description, schema: shapeToJsonSchema(shape) })
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

  return { register, handlers, definitions }
}

/** Crea un servidor MCP con tools de diagnostico OBD-II y, opcionalmente, de conocimiento RAG. */
export function createMcpServer(
  repo: ObdRepository,
  vehicleRepo?: VehicleRepository,
  knowledgeStack?: KnowledgeStackPort,
  webSearch?: WebSearchPort,
  sessionContext?: SessionContext,
): DiagnosticsMcpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  })

  const { register: registerTool, handlers, definitions } = createToolRegistry(server)

  registerDiagnosticTools(registerTool, repo, vehicleRepo, sessionContext)

  if (knowledgeStack) {
    registerKnowledgeTools(registerTool, knowledgeStack, repo, vehicleRepo)
  }

  if (webSearch) {
    registerWebSearchTool(registerTool, webSearch, createWebSearchBudget())
  }

  return {
    server,
    // `async` a proposito: la firma promete una Promise, y un throw sincrono
    // se escaparia de cualquier llamante que use `.catch()` sin try/catch.
    callTool: async (name, args) => {
      const handler = handlers[name]
      if (!handler) throw new ToolNotFoundError(name)
      return handler(args)
    },
    listTools: () => definitions,
  }
}
