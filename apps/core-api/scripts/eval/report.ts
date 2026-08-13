import { createHash } from 'node:crypto'
import { COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT } from '@/application/prompts/cognitiveDiagnosisPrompt.js'
import type { AgentAnswer } from './invariants.js'
import type { CaseGroup, EvalCase } from './cases.js'

/**
 * Presentacion y veredicto de la bateria.
 *
 * Sigue el estilo de `verify-semantic-search.ts`: texto plano, sin colores ni
 * dependencias, para que se pueda leer en terminal y redirigir a fichero.
 */

/** Motivo por el que un caso no pasa. */
export interface Failure {
  readonly id: string
  readonly reason: string
  /** Los fatales marcan exit code 1; el resto solo avisa. */
  readonly fatal: boolean
}

/** Resultado de ejecutar un caso una vez. */
export interface CaseOutcome {
  readonly evalCase: EvalCase
  /** Ausente si la ejecucion reventó. */
  readonly answer?: AgentAnswer
  readonly error?: string
  readonly failures: readonly Failure[]
  readonly elapsedMs: number
}

/**
 * Grupos cuyos asserts son de seguridad o de ambito.
 *
 * Un fallo aqui es binario y tumba el run. Competencia (A) y calibracion (F)
 * tienen la varianza propia del modelo: avisan, no bloquean.
 */
export const FATAL_GROUPS: ReadonlySet<CaseGroup> = new Set<CaseGroup>(['B', 'C', 'D', 'E'])

const SEPARATOR = '='.repeat(78)
const MAX_PREVIEW_LINES = 24

/** Huella del prompt con el que se corrio: sin esto, un informe viejo no dice contra que corrio. */
export function promptFingerprint(): string {
  return createHash('sha256').update(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).digest('hex').slice(0, 12)
}

/** Recorta la narrativa para que un caso no ocupe media pantalla en el informe. */
function preview(text: string): string {
  const lines = text.split('\n')
  if (lines.length <= MAX_PREVIEW_LINES) return text
  return [
    ...lines.slice(0, MAX_PREVIEW_LINES),
    `… (${lines.length - MAX_PREVIEW_LINES} líneas más)`,
  ].join('\n')
}

function toolSummary(answer: AgentAnswer): string {
  if (answer.toolCalls.length === 0) return '(ninguna)'
  const counts = new Map<string, number>()
  for (const call of answer.toolCalls) counts.set(call.tool, (counts.get(call.tool) ?? 0) + 1)
  return [...counts].map(([tool, n]) => (n > 1 ? `${tool} x${n}` : tool)).join(', ')
}

/** Imprime un caso completo: lo que se preguntó, lo que salió y qué falló. */
export function printCaseOutcome(outcome: CaseOutcome, iteration?: number): void {
  const { evalCase, answer, failures } = outcome
  const suffix = iteration === undefined ? '' : ` · pasada ${iteration}`
  console.log(`\n${SEPARATOR}`)
  console.log(`${evalCase.id} · grupo ${evalCase.group}${suffix} · ${outcome.elapsedMs} ms`)
  console.log(`CONSULTA: ${evalCase.query ?? '(diagnóstico general, sin consulta)'}`)

  if (outcome.error) {
    console.log(`\n✗ EJECUCIÓN FALLIDA: ${outcome.error}`)
    return
  }
  if (!answer) return

  console.log(`\n--- respuesta ---\n${preview(answer.diagnosis)}`)
  console.log(
    `\nseveridad: ${answer.severity} · confianza: ${answer.confidence} · recomendaciones: ${answer.recommendations.length}`,
  )
  console.log(`tools: ${toolSummary(answer)}`)
  console.log(`RÚBRICA (juicio humano): ${evalCase.rubric}`)

  if (failures.length === 0) {
    console.log('\n✓ sin fallos automáticos')
    return
  }
  console.log('')
  for (const failure of failures) {
    console.log(`${failure.fatal ? '✗' : '!'} ${failure.id}: ${failure.reason}`)
  }
}

/** Cuenta de fallos por grupo, para leer el run de un vistazo. */
function groupTally(outcomes: readonly CaseOutcome[]): string[] {
  const groups = [...new Set(outcomes.map((o) => o.evalCase.group))].sort()
  return groups.map((group) => {
    const ofGroup = outcomes.filter((o) => o.evalCase.group === group)
    const failed = ofGroup.filter((o) => o.failures.length > 0 || o.error).length
    const mark = failed === 0 ? '✓' : FATAL_GROUPS.has(group) ? '✗' : '!'
    return `  ${mark} grupo ${group}: ${ofGroup.length - failed}/${ofGroup.length} limpios`
  })
}

/** Resumen final: recuento por grupo, fallos fatales y huella del prompt. */
export function printSummary(outcomes: readonly CaseOutcome[]): void {
  const fatal = outcomes.flatMap((o) =>
    o.failures.filter((f) => f.fatal).map((f) => `${o.evalCase.id} · ${f.id}: ${f.reason}`),
  )
  const errored = outcomes.filter((o) => o.error)

  console.log(`\n${SEPARATOR}`)
  console.log('RESUMEN')
  for (const line of groupTally(outcomes)) console.log(line)
  console.log(`\nejecuciones: ${outcomes.length} · con error de ejecución: ${errored.length}`)

  if (fatal.length > 0) {
    console.log(`\nFALLOS DE SEGURIDAD O ÁMBITO (${fatal.length}):`)
    for (const line of fatal) console.log(`  ✗ ${line}`)
  } else {
    console.log('\n✓ ningún fallo de seguridad ni de ámbito')
  }

  console.log(`\nhuella del system prompt: ${promptFingerprint()}`)
  console.log('Los avisos "!" son de competencia o calibración: se leen, no bloquean.')
  console.log(SEPARATOR)
}

/** 1 solo si falló seguridad/ámbito o si algún caso reventó. */
export function exitCodeFor(outcomes: readonly CaseOutcome[]): number {
  const hasFatal = outcomes.some((o) => o.error !== undefined || o.failures.some((f) => f.fatal))
  return hasFatal ? 1 : 0
}
