import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

import { loadConfig } from '@/infrastructure/configuration/index.js'
import { createAnthropicClient } from '@/infrastructure/llm/anthropicClient.js'
import { createOpenAiClient } from '@/infrastructure/llm/openAiClient.js'
import { ExecuteCognitiveDiagnosisUseCase } from '@/application/use-cases/ExecuteCognitiveDiagnosisUseCase.js'
import { withTimeout } from '@/application/shared/withTimeout.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmConversationItem } from '@/application/dto/llm/LlmMessageInput.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import { EVAL_CASES, type CaseGroup, type EvalCase } from './eval/cases.js'
import { INVARIANTS, type AgentAnswer } from './eval/invariants.js'
import {
  EVAL_VEHICLE,
  createCapturingLlmClient,
  createEvalHarness,
  silentLogger,
} from './eval/stubs.js'
import {
  FATAL_GROUPS,
  exitCodeFor,
  printCaseOutcome,
  printSummary,
  promptFingerprint,
  type CaseOutcome,
  type Failure,
} from './eval/report.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/**
 * Carga el `.env` de la maquina, probando de mas especifico a mas general.
 *
 * dotenv no pisa lo que ya esta en `process.env`, asi que el orden es la
 * prioridad. Se prueban varios porque el fichero no esta versionado y cada
 * maquina lo tiene donde lo tiene.
 *
 * Va aqui y no arriba del todo porque los imports estaticos se evaluan antes
 * que el cuerpo del modulo: solo es correcto porque ninguno de ellos lee
 * `process.env` al cargarse — `loadConfig()` es la unica lectura y es explicita.
 */
function loadEnvFile(): void {
  for (const candidate of [
    resolve(HERE, '../.env'),
    resolve(HERE, '../../.env'),
    resolve(HERE, '../../../.env'),
  ]) {
    if (existsSync(candidate)) dotenv.config({ path: candidate })
  }
}

/**
 * Bateria de evaluacion del agente de diagnostico contra un LLM real.
 *
 * Uso:
 *   pnpm eval:agent                    # los 30 casos
 *   pnpm eval:agent --only=B,C,D,E     # solo seguridad y ambito
 *   pnpm eval:agent --case=C5          # un caso suelto
 *   pnpm eval:agent --only=C --repeat=3
 *   pnpm eval:agent --json             # salida para diffear entre pasadas
 *
 * Que se prueba y que no: aqui solo van los fallos que **unicamente puede
 * provocar el modelo**. Lo que puede provocar el codigo (saneado de la
 * narrativa, tope de recomendaciones, bloque JSON sin cerrar) es unit test en
 * `cognitiveDiagnosisLeakage.test.ts`, que corre sin gastar un token.
 *
 * Cuesta dinero: cada caso es una conversacion completa con tool calling.
 */

/** Un caso puede encadenar varias llamadas al modelo; 3 min es holgado sin ser eterno. */
const CASE_TIMEOUT_MS = 180_000

interface CliOptions {
  readonly groups?: ReadonlySet<CaseGroup>
  readonly caseIds?: ReadonlySet<string>
  readonly repeat: number
  readonly json: boolean
}

function parseArgs(argv: readonly string[]): CliOptions {
  const valueOf = (flag: string): string | undefined =>
    argv.find((a) => a.startsWith(`${flag}=`))?.split('=')[1]

  const only = valueOf('--only')
  const cases = valueOf('--case')
  const repeat = Number(valueOf('--repeat') ?? 1)

  return {
    groups: only
      ? new Set(only.split(',').map((g) => g.trim().toUpperCase() as CaseGroup))
      : undefined,
    caseIds: cases ? new Set(cases.split(',').map((c) => c.trim().toUpperCase())) : undefined,
    repeat: Number.isFinite(repeat) && repeat > 0 ? Math.floor(repeat) : 1,
    json: argv.includes('--json'),
  }
}

function selectCases(options: CliOptions): readonly EvalCase[] {
  return EVAL_CASES.filter(
    (c) =>
      (!options.groups || options.groups.has(c.group)) &&
      (!options.caseIds || options.caseIds.has(c.id.toUpperCase())),
  )
}

/**
 * Cliente LLM con la misma seleccion que `composition.ts::createLlmClient`.
 *
 * Se replica en vez de importarse porque aquella lanza si falta la clave, y
 * aqui la ausencia de clave no es un error: es "no hay nada que evaluar".
 */
function createLlmClient(): LlmClientPort | undefined {
  const config = loadConfig()
  if (config.LLM_PROVIDER === 'anthropic' && config.ANTHROPIC_API_KEY) {
    return createAnthropicClient({
      apiKey: config.ANTHROPIC_API_KEY,
      model: config.LLM_MODEL,
      logger: silentLogger,
    })
  }
  if (config.LLM_PROVIDER === 'openai' && config.LLM_API_KEY && config.LLM_BASE_URL) {
    return createOpenAiClient({
      apiKey: config.LLM_API_KEY,
      baseURL: config.LLM_BASE_URL,
      model: config.LLM_MODEL ?? 'gpt-4o-mini',
      logger: silentLogger,
    })
  }
  return undefined
}

/**
 * Historial del turno previo para los casos multivuelta.
 *
 * `buildRawResponse` de los adaptadores acepta `{text}` ademas de la respuesta
 * cruda del proveedor, asi que se puede reconstruir el turno del asistente sin
 * guardar el objeto del SDK.
 */
function priorTurn(query: string, answer: string): readonly LlmConversationItem[] {
  return [
    { __type: 'user_message', content: query },
    { __type: 'raw_response', data: { text: answer } },
  ]
}

/** Ejecuta el use case real con el cableado de la bateria y devuelve la respuesta cruda y limpia. */
async function ask(
  evalCase: EvalCase,
  llm: LlmClientPort,
  query: string | undefined,
  history?: readonly LlmConversationItem[],
): Promise<AgentAnswer> {
  const { mcp, knowledge } = createEvalHarness(evalCase)
  const capturing = createCapturingLlmClient(llm)

  const handler: ToolCallHandlerPort = async (name, args) => {
    const result = await mcp.callTool(name, args)
    return result.content[0]?.text ?? ''
  }

  const useCase = new ExecuteCognitiveDiagnosisUseCase({
    llmClient: capturing.client,
    tools: mcp.listTools(),
    handler,
    logger: silentLogger,
    diagnosisIndex: knowledge.diagnosisIndex,
  })

  const output = await useCase.execute({
    userQuery: query,
    vehicleContext: evalCase.withVehicle === false ? undefined : EVAL_VEHICLE,
    conversationHistory: history,
  })

  return {
    diagnosis: output.diagnosis,
    rawText: capturing.lastRawText(),
    severity: output.severity,
    confidence: output.confidence,
    recommendations: output.recommendations,
    toolCalls: output.toolCalls,
  }
}

/** Aplica los invariantes globales y los asserts propios del caso. */
function evaluate(evalCase: EvalCase, answer: AgentAnswer): readonly Failure[] {
  const groupIsFatal = FATAL_GROUPS.has(evalCase.group)

  const invariantFailures = INVARIANTS.flatMap((invariant) => {
    const reason = invariant.check(answer)
    return reason ? [{ id: invariant.id, reason, fatal: invariant.security }] : []
  })

  const assertFailures = (evalCase.asserts ?? []).flatMap((assert, i) => {
    const reason = assert(answer)
    return reason ? [{ id: `${evalCase.id}.assert-${i + 1}`, reason, fatal: groupIsFatal }] : []
  })

  return [...invariantFailures, ...assertFailures]
}

async function runCase(evalCase: EvalCase, llm: LlmClientPort): Promise<CaseOutcome> {
  const startedAt = Date.now()
  try {
    // El turno previo se ejecuta de verdad: un multivuelta con la respuesta
    // anterior inventada no prueba lo que dice probar.
    let history: readonly LlmConversationItem[] | undefined
    if (evalCase.priorQuery) {
      const first = await withTimeout(
        ask(evalCase, llm, evalCase.priorQuery),
        CASE_TIMEOUT_MS,
        `${evalCase.id}: el turno previo agotó el tiempo`,
      )
      history = priorTurn(evalCase.priorQuery, first.diagnosis)
    }

    const answer = await withTimeout(
      ask(evalCase, llm, evalCase.query, history),
      CASE_TIMEOUT_MS,
      `${evalCase.id}: agotó el tiempo`,
    )
    return {
      evalCase,
      answer,
      failures: evaluate(evalCase, answer),
      elapsedMs: Date.now() - startedAt,
    }
  } catch (err) {
    return {
      evalCase,
      error: err instanceof Error ? err.message : String(err),
      failures: [],
      elapsedMs: Date.now() - startedAt,
    }
  }
}

/** Vuelca el run como JSON, para diffear dos pasadas o guardarlo con el informe. */
function printJson(outcomes: readonly CaseOutcome[]): void {
  console.log(
    JSON.stringify(
      {
        promptFingerprint: promptFingerprint(),
        runAt: new Date().toISOString(),
        outcomes: outcomes.map((o) => ({
          id: o.evalCase.id,
          group: o.evalCase.group,
          query: o.evalCase.query ?? null,
          rubric: o.evalCase.rubric,
          error: o.error ?? null,
          diagnosis: o.answer?.diagnosis ?? null,
          severity: o.answer?.severity ?? null,
          confidence: o.answer?.confidence ?? null,
          recommendations: o.answer?.recommendations ?? [],
          tools: o.answer?.toolCalls.map((t) => t.tool) ?? [],
          failures: o.failures,
          elapsedMs: o.elapsedMs,
        })),
      },
      null,
      2,
    ),
  )
}

async function main(): Promise<void> {
  loadEnvFile()
  const options = parseArgs(process.argv.slice(2))
  const selected = selectCases(options)

  if (selected.length === 0) {
    console.error('Ningún caso coincide con el filtro. Grupos: A B C D E F.')
    process.exit(1)
  }

  const llm = createLlmClient()
  if (!llm) {
    // Sin clave no es un fallo: es que esta maquina no puede evaluar. Salir 1
    // aqui convertiria cualquier CI sin secretos en rojo permanente.
    console.log('Sin LLM configurado (LLM_PROVIDER + API key): no se ejecuta la batería.')
    console.log(
      'Configura .env con LLM_PROVIDER=anthropic y ANTHROPIC_API_KEY y vuelve a lanzarlo.',
    )
    process.exit(0)
  }

  if (!options.json) {
    console.log(`Batería del agente · ${selected.length} casos × ${options.repeat} pasada(s)`)
    console.log(`Huella del system prompt: ${promptFingerprint()}`)
    console.log('Consume tokens de verdad: es una conversación completa por caso.')
  }

  const outcomes: CaseOutcome[] = []
  for (let iteration = 1; iteration <= options.repeat; iteration++) {
    for (const evalCase of selected) {
      // Secuencial a proposito: en paralelo se choca con el rate limit y las
      // respuestas salen desordenadas, que es justo lo que hay que leer.
      const outcome = await runCase(evalCase, llm)
      outcomes.push(outcome)
      if (!options.json) printCaseOutcome(outcome, options.repeat > 1 ? iteration : undefined)
    }
  }

  if (options.json) printJson(outcomes)
  else printSummary(outcomes)

  process.exit(exitCodeFor(outcomes))
}

await main()
