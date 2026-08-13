import { z } from 'zod'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import { wrapUntrustedResult } from '@/infrastructure/mcp/webSearchContent.js'
import {
  MAX_WEB_SEARCHES_PER_SESSION,
  type WebSearchBudget,
} from '@/infrastructure/mcp/webSearchBudget.js'
import {
  text,
  errorText,
  withErrorHandling,
  type ToolRegistrar,
} from '@/infrastructure/mcp/mcpToolkit.js'

/**
 * Registra la tool MCP `web_search` si hay un puerto de búsqueda configurado.
 *
 * El presupuesto de llamadas vive dentro de `createMcpServer` porque el servidor
 * MCP se crea uno nuevo por cada petición HTTP (`cognitiveDiagnosis()`/`callMcpTool()`).
 * Un contador creado aquí es automáticamente "por sesión de diagnóstico" sin
 * necesidad de estado compartido ni Redis.
 */
export function registerWebSearchTool(
  register: ToolRegistrar,
  webSearch: WebSearchPort,
  budget: WebSearchBudget,
): void {
  register(
    'web_search',
    'Search the internet for unknown PIDs, DTCs, or diagnostic information not found in the vector database.',
    { query: z.string() },
    withErrorHandling(async (args) => {
      if (!budget.tryConsume()) {
        return errorText(
          `[client_error] Web search budget exhausted for this session (max ${MAX_WEB_SEARCHES_PER_SESSION} searches per diagnosis)`,
        )
      }
      const results = await webSearch.search(args.query as string)
      if (results.length === 0) return text('No web results found.')
      const formatted = results
        .map((r) => `Title: ${r.title}\nURL: ${r.url}\n${wrapUntrustedResult(r.snippet)}`)
        .join('\n\n')
      return text(formatted)
    }),
  )
}
