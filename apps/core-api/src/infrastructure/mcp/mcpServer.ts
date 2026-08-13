import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import { createWebSearchBudget } from '@/infrastructure/mcp/webSearchBudget.js'
import {
  shapeToJsonSchema,
  type ToolCallResult,
  type ToolHandler,
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

/** Crea un servidor MCP con tools de diagnostico OBD-II y, opcionalmente, de conocimiento RAG. */
export function createMcpServer(
  repo: ObdRepository,
  vehicleRepo?: VehicleRepository,
  knowledgeStack?: KnowledgeStack,
  webSearch?: WebSearchPort,
  sessionContext?: SessionContext,
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

  registerDiagnosticTools(registerTool, repo, vehicleRepo, sessionContext)

  if (knowledgeStack) {
    registerKnowledgeTools(registerTool, knowledgeStack, repo)
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
    listTools: () => toolDefinitions,
  }
}
