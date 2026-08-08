import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import crypto from 'node:crypto'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import {
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from '@/infrastructure/elm327/errors.js'
import { ToolNotFoundError } from '@/infrastructure/mcp/errors.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import { initialConfidenceFor } from '@/application/knowledge/confidenceScale.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'
import { ValidateDiscoveredPidUseCase } from '@/application/use-cases/ValidateDiscoveredPidUseCase.js'
import { ValidateDiscoveredDtcUseCase } from '@/application/use-cases/ValidateDiscoveredDtcUseCase.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import { wrapUntrustedResult } from '@/infrastructure/mcp/webSearchContent.js'
import {
  createWebSearchBudget,
  MAX_WEB_SEARCHES_PER_SESSION,
  type WebSearchBudget,
} from '@/infrastructure/mcp/webSearchBudget.js'
import { WebSearchProviderError } from '@/infrastructure/web-search/WebSearchProviderError.js'

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
  if (err instanceof WebSearchProviderError) return 'external_error'
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
        .map((e) => `${e.name} (${e.type}, ${e.requestAddr}→${e.responseAddr}) — ${e.protocol}`)
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

// ─── Knowledge tool handlers ────────────────────────────────────────────────

const SOURCE_MECHANIC = 'mechanic'
const MCP_KNOWLEDGE_DEFAULT_LIMIT = 5

/** Campos a mostrar en los resultados de busqueda segun el tipo de entrada. */
interface SearchFieldDescriptor<TEntry> {
  readonly extract: (entry: TEntry) => string
}

/**
 * Formatea una lista de resultados de busqueda vectorial como texto, un resultado por linea.
 *
 * Compartido por las tres tools de busqueda: solo cambian los campos a mostrar de cada tipo
 * de entrada (PIDs, DTCs y diagnosticos).
 */
function formatSearchResults<TEntry>(
  results: readonly { entry: TEntry; distance: number }[],
  fields: readonly SearchFieldDescriptor<TEntry>[],
): string {
  return results
    .map((r) => {
      const fieldText = fields.map((f) => f.extract(r.entry)).join(', ')
      return `${r.distance.toFixed(2)} ${fieldText}`
    })
    .join('\n')
}

/** Campos compartidos por los tres tipos de entrada: texto incrustado, fabricante y modelo. */
function knowledgeSearchFields<
  TEntry extends { embeddedText: string; manufacturer: string; model: string },
>(): readonly SearchFieldDescriptor<TEntry>[] {
  return [
    { extract: (e) => e.embeddedText },
    { extract: (e) => e.manufacturer },
    { extract: (e) => e.model },
  ]
}

function resolveSearchFilter(
  manufacturer: unknown,
  model: unknown,
): { manufacturer?: string; model?: string } | undefined {
  return manufacturer || model
    ? { manufacturer: manufacturer as string | undefined, model: model as string | undefined }
    : undefined
}

/** Factory compartida para las tres tools de busqueda semantica, identicas salvo el indice y el mensaje de vacio. */
function handleSearchSimilar<
  TEntry extends { embeddedText: string; manufacturer: string; model: string },
>(
  search: (
    query: string,
    options: { limit?: number; filter?: { manufacturer?: string; model?: string } },
  ) => Promise<{ entry: TEntry; distance: number }[]>,
  emptyMessage: string,
): ToolHandler {
  const fields = knowledgeSearchFields<TEntry>()
  return async ({ query, manufacturer, model, limit }) => {
    const results = await search(query as string, {
      limit: (limit as number | undefined) ?? MCP_KNOWLEDGE_DEFAULT_LIMIT,
      filter: resolveSearchFilter(manufacturer, model),
    })
    if (results.length === 0) return text(emptyMessage)
    return text(formatSearchResults(results, fields))
  }
}

function resolveKnowledgeSource(args: Record<string, unknown>): KnowledgeSource {
  return (args.source as string) === SOURCE_MECHANIC
    ? KnowledgeSource.Mechanic
    : KnowledgeSource.Web
}

/** Construye la entrada base comun a PIDs y DTCs (texto, fabricante, modelo, confianza, procedencia). */
function baseKnowledgeEntry(
  args: Record<string, unknown>,
  source: KnowledgeSource,
): Pick<
  PidKnowledgeEntry,
  'id' | 'embeddedText' | 'manufacturer' | 'model' | 'confidence' | 'source' | 'validated'
> {
  return {
    id: crypto.randomUUID(),
    embeddedText: args.embeddedText as string,
    manufacturer: args.manufacturer as string,
    model: args.model as string,
    confidence: initialConfidenceFor(source),
    source,
    validated: false,
  }
}

function formatIndexedMessage(
  prefix: string,
  entry: { id: string; confidence: number },
  validated: boolean,
  outcome?: string,
): string {
  const status = validated ? 'validated' : `unvalidated${outcome ? `: ${outcome}` : ''}`
  return `Indexed ${prefix} ${entry.id} (confidence ${entry.confidence}, ${status})`
}

function handleIndexPid(stack: KnowledgeStack, obdRepo: ObdRepository): ToolHandler {
  return async (args) => {
    const source = resolveKnowledgeSource(args)
    const entry: PidKnowledgeEntry = { ...baseKnowledgeEntry(args, source), validated: false }

    const mode = args.mode as string | undefined
    const pid = args.pid as string | undefined
    const formula = args.formula as string | undefined
    const dataBytes = args.dataBytes as number | undefined

    if (mode && pid && formula && dataBytes !== undefined) {
      const pidFormula: PidFormulaSource = {
        pidCode: { key: `${mode} ${pid}` },
        formula,
        dataBytes,
      }
      const minValue = args.minValue as number | undefined
      const maxValue = args.maxValue as number | undefined
      const useCase = new ValidateDiscoveredPidUseCase()
      const result = await useCase.execute(entry, pidFormula, { minValue, maxValue }, obdRepo)

      await stack.pidsIndex.index(result.entry)
      return text(
        formatIndexedMessage(
          'PID',
          result.entry,
          result.entry.validated,
          result.outcome === 'validated' ? undefined : result.outcome,
        ),
      )
    }

    await stack.pidsIndex.index(entry)
    return text(formatIndexedMessage('PID', entry, false))
  }
}

function handleIndexDtc(stack: KnowledgeStack, obdRepo: ObdRepository): ToolHandler {
  return async (args) => {
    const source = resolveKnowledgeSource(args)
    const entry: DtcKnowledgeEntry = { ...baseKnowledgeEntry(args, source), validated: false }

    const code = args.code as string | undefined
    if (code) {
      const useCase = new ValidateDiscoveredDtcUseCase()
      const result = await useCase.execute(entry, code, obdRepo)

      await stack.dtcsIndex.index(result.entry)
      return text(
        formatIndexedMessage(
          'DTC',
          result.entry,
          result.entry.validated,
          result.outcome === 'validated' ? undefined : result.outcome,
        ),
      )
    }

    await stack.dtcsIndex.index(entry)
    return text(formatIndexedMessage('DTC', entry, false))
  }
}

function handleIndexDiagnosis(stack: KnowledgeStack): ToolHandler {
  return async (args) => {
    const entry: DiagnosisKnowledgeEntry = {
      id: crypto.randomUUID(),
      embeddedText: args.embeddedText as string,
      manufacturer: args.manufacturer as string,
      model: args.model as string,
      symptoms: (args.symptoms as string[]) ?? [],
      pidsInvolved: (args.pidsInvolved as string[]) ?? [],
      confidence: initialConfidenceFor(KnowledgeSource.PreviousDiagnosis),
      source: KnowledgeSource.PreviousDiagnosis,
    }

    await stack.diagnosisIndex.index(entry)
    return text(formatIndexedMessage('diagnosis', entry, false))
  }
}

/**
 * Registra las tools MCP de conocimiento sobre los indices vectoriales inyectados.
 *
 * Misma forma que {@link registerDiagnosticTools}: recibe un `register` y un `stack`.
 * Si el stack esta ausente esta funcion nunca se invoca — no hay codigo de guarda
 * redundante dentro de ella.
 */
function registerKnowledgeTools(
  register: ToolRegistrar,
  stack: KnowledgeStack,
  repo: ObdRepository,
): void {
  const searchShape = {
    query: z.string(),
    manufacturer: z.string().optional(),
    model: z.string().optional(),
    limit: z.number().optional(),
  }

  register(
    'search_similar_pids',
    'Search PID knowledge base by semantic similarity. Returns distance + fields.',
    searchShape,
    withErrorHandling(
      handleSearchSimilar<PidKnowledgeEntry>(
        (query, opts) => stack.pidsIndex.search(query, opts),
        'No PIDs found.',
      ),
    ),
  )
  register(
    'search_similar_dtcs',
    'Search DTC knowledge base by semantic similarity. Returns distance + fields.',
    searchShape,
    withErrorHandling(
      handleSearchSimilar<DtcKnowledgeEntry>(
        (query, opts) => stack.dtcsIndex.search(query, opts),
        'No DTCs found.',
      ),
    ),
  )
  register(
    'search_similar_diagnoses',
    'Search diagnosis knowledge base by semantic similarity. Returns distance + fields.',
    searchShape,
    withErrorHandling(
      handleSearchSimilar<DiagnosisKnowledgeEntry>(
        (query, opts) => stack.diagnosisIndex.search(query, opts),
        'No diagnoses found.',
      ),
    ),
  )
  register(
    'index_pid',
    'Index a discovered PID into the knowledge base. Optionally validates against the connected vehicle.',
    {
      embeddedText: z.string(),
      manufacturer: z.string(),
      model: z.string(),
      source: z.string(),
      mode: z.string().optional(),
      pid: z.string().optional(),
      formula: z.string().optional(),
      dataBytes: z.number().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
    },
    withErrorHandling(handleIndexPid(stack, repo)),
  )
  register(
    'index_dtc',
    'Index a discovered DTC into the knowledge base. Optionally validates against the connected vehicle.',
    {
      embeddedText: z.string(),
      manufacturer: z.string(),
      model: z.string(),
      source: z.string(),
      code: z.string().optional(),
    },
    withErrorHandling(handleIndexDtc(stack, repo)),
  )
  register(
    'index_diagnosis',
    'Index a resolved diagnosis into the knowledge base for future retrieval. Confidence and source are fixed.',
    {
      embeddedText: z.string(),
      manufacturer: z.string(),
      model: z.string(),
      symptoms: z.array(z.string()),
      pidsInvolved: z.array(z.string()),
    },
    withErrorHandling(handleIndexDiagnosis(stack)),
  )
}

/**
 * Registra la tool MCP `web_search` si hay un puerto de búsqueda configurado.
 *
 * El presupuesto de llamadas vive dentro de `createMcpServer` porque el servidor
 * MCP se crea uno nuevo por cada petición HTTP (`cognitiveDiagnosis()`/`callMcpTool()`).
 * Un contador creado aquí es automáticamente "por sesión de diagnóstico" sin
 * necesidad de estado compartido ni Redis.
 */
function registerWebSearchTool(
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

/** Crea un servidor MCP con tools de diagnostico OBD-II y, opcionalmente, de conocimiento RAG. */
export function createMcpServer(
  repo: ObdRepository,
  vehicleRepo?: VehicleRepository,
  knowledgeStack?: KnowledgeStack,
  webSearch?: WebSearchPort,
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
