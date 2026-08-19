/**
 * Prueba manual de la validación OBD del catálogo (change add-knowledge-confidence-validation).
 *
 * Estos casos de uso todavía no tienen llamador en runtime — los conectará el bloque
 * `add-knowledge-mcp-tools`. Este script los ejercita a mano contra el simulador o contra un
 * ELM327 real, para poder ver los seis desenlaces sin esperar a ese bloque.
 *
 * Uso:
 *   pnpm tsx scripts/try-validation.ts                  # simulador (escenario audi-a3-idle)
 *   OBD_MODE=tcp pnpm tsx scripts/try-validation.ts     # ELM327 real en localhost:35000
 */
import { ValidateDiscoveredPidUseCase } from '@/application/use-cases/ValidateDiscoveredPidUseCase.js'
import type { PidRange } from '@/application/use-cases/ValidateDiscoveredPidUseCase.js'
import { ValidateDiscoveredDtcUseCase } from '@/application/use-cases/ValidateDiscoveredDtcUseCase.js'
import { initialConfidenceFor } from '@/application/knowledge/confidenceScale.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'
import { ObdSimulator } from '@/infrastructure/simulation/simulator.js'
import { ObdSimulatorRepository } from '@/infrastructure/simulation/simulatorAdapter.js'
import { seedScenarios } from '@/infrastructure/simulation/seedScenarios.js'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import { createElm327TcpClient } from '@/infrastructure/elm327/tcpTransport.js'

const DEMO_SCENARIO_ID = 'audi-a3-idle'

/** RPM: modelado por el escenario, asi que el simulador si puede entregar bytes crudos. */
const RPM_PID: PidFormulaSource = {
  pidCode: { key: '01 0C' },
  formula: '(A*256+B)/4',
  dataBytes: 2,
}

/** PID propietario Mode 22: ningun escenario lo modela. */
const PROPRIETARY_PID: PidFormulaSource = {
  pidCode: { key: '22 F40C' },
  formula: 'A*256+B',
  dataBytes: 2,
}

const PLAUSIBLE_RPM_RANGE: PidRange = { minValue: 0, maxValue: 8000 }

/** Rango imposible para un motor en marcha: fuerza el desenlace `out_of_range`. */
const IMPOSSIBLE_RANGE: PidRange = { minValue: 0, maxValue: 10 }

/** El escenario audi-a3-idle trae este DTC activo. */
const ACTIVE_DTC = 'P0301'
const ABSENT_DTC = 'P9999'

const useTcp = process.env.OBD_MODE === 'tcp'
const pidUseCase = new ValidateDiscoveredPidUseCase()
const dtcUseCase = new ValidateDiscoveredDtcUseCase()

function buildRepo(): ObdRepository {
  if (useTcp) {
    const transport = createElm327TcpClient({
      host: process.env.ELM327_HOST ?? 'localhost',
      port: Number(process.env.ELM327_PORT ?? 35000),
    })
    return new Elm327TcpRepository(transport)
  }
  const scenario = seedScenarios.find((s) => s.id === DEMO_SCENARIO_ID)
  if (!scenario) throw new Error(`escenario ${DEMO_SCENARIO_ID} no encontrado`)
  return new ObdSimulatorRepository(new ObdSimulator(scenario))
}

/** Un PID "descubierto" nace con la confianza inicial de su procedencia. */
function discoveredPid(source: KnowledgeSource): PidKnowledgeEntry {
  return {
    id: 'pid-demo',
    embeddedText: 'Audi A3 regimen del motor',
    manufacturer: 'Audi',
    model: 'A3',
    confidence: initialConfidenceFor(source),
    source,
    validated: false,
  }
}

function discoveredDtc(source: KnowledgeSource): DtcKnowledgeEntry {
  return {
    id: 'dtc-demo',
    embeddedText: 'Audi A3 fallo de encendido cilindro 1',
    manufacturer: 'Audi',
    model: 'A3',
    confidence: initialConfidenceFor(source),
    source,
    validated: false,
  }
}

interface Outcome {
  readonly outcome: string
  readonly entry: { readonly confidence: number; readonly validated: boolean }
}

function show(label: string, before: number, result: Outcome): void {
  const { outcome, entry } = result
  console.log(
    `  ${label.padEnd(34)} outcome=${outcome.padEnd(13)} confidence ${before} → ${entry.confidence}  validated=${String(entry.validated)}`,
  )
}

interface TryPidOptions {
  readonly label: string
  readonly source: KnowledgeSource
  readonly pid: PidFormulaSource
  readonly range: PidRange
  readonly repo: ObdRepository | undefined
}

/** Valida un PID recien descubierto de la procedencia indicada y muestra el desenlace. */
async function tryPid({ label, source, pid, range, repo }: TryPidOptions): Promise<void> {
  const entry = discoveredPid(source)
  show(label, entry.confidence, await pidUseCase.execute(entry, pid, range, repo))
}

async function exercisePidScenarios(repo: ObdRepository): Promise<void> {
  console.log('PID modelado por el escenario (01 0C, RPM), fórmula y rango correctos:')
  await tryPid({
    label: 'origen web (0.3 → 0.7)',
    source: KnowledgeSource.Web,
    pid: RPM_PID,
    range: PLAUSIBLE_RPM_RANGE,
    repo,
  })
  await tryPid({
    label: 'origen mecanico (0.8 → 0.9)',
    source: KnowledgeSource.Mechanic,
    pid: RPM_PID,
    range: PLAUSIBLE_RPM_RANGE,
    repo,
  })

  console.log('\nMismo PID con un rango imposible (el valor real cae fuera):')
  await tryPid({
    label: 'rango 0..10',
    source: KnowledgeSource.Web,
    pid: RPM_PID,
    range: IMPOSSIBLE_RANGE,
    repo,
  })

  console.log('\nPID propietario que el simulador no modela (22 F40C):')
  await tryPid({
    label: 'lectura cruda no soportada',
    source: KnowledgeSource.Web,
    pid: PROPRIETARY_PID,
    range: PLAUSIBLE_RPM_RANGE,
    repo,
  })

  console.log('\nSin vehiculo conectado:')
  await tryPid({
    label: 'obdRepo undefined',
    source: KnowledgeSource.Web,
    pid: RPM_PID,
    range: {},
    repo: undefined,
  })
}

async function exerciseDtcScenarios(repo: ObdRepository): Promise<void> {
  console.log(`\nDTC: el escenario ${DEMO_SCENARIO_ID} tiene ${ACTIVE_DTC} activo.`)
  for (const [label, code] of [
    [`${ACTIVE_DTC} (presente)`, ACTIVE_DTC],
    [`${ABSENT_DTC} (ausente)`, ABSENT_DTC],
  ]) {
    const entry = discoveredDtc(KnowledgeSource.Web)
    show(label, entry.confidence, await dtcUseCase.execute(entry, code, repo))
  }
}

async function main(): Promise<void> {
  const repo = buildRepo()
  console.log(`\nModo: ${useTcp ? 'ELM327 TCP real' : `simulador (${DEMO_SCENARIO_ID})`}\n`)

  await exercisePidScenarios(repo)
  await exerciseDtcScenarios(repo)

  console.log()
  if (repo instanceof Elm327TcpRepository) await repo.close()
}

await main()
