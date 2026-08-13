import { z } from 'zod'
import crypto from 'node:crypto'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import { initialConfidenceFor } from '@/application/knowledge/confidenceScale.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'
import { ValidateDiscoveredPidUseCase } from '@/application/use-cases/ValidateDiscoveredPidUseCase.js'
import { ValidateDiscoveredDtcUseCase } from '@/application/use-cases/ValidateDiscoveredDtcUseCase.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import {
  text,
  withErrorHandling,
  type ToolHandler,
  type ToolRegistrar,
} from '@/infrastructure/mcp/mcpToolkit.js'

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
    const entry: PidKnowledgeEntry = baseKnowledgeEntry(args, source)

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
    const entry: DtcKnowledgeEntry = baseKnowledgeEntry(args, source)

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
// eslint-disable-next-line max-lines-per-function -- lista declarativa de registro (complejidad 1)
export function registerKnowledgeTools(
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
