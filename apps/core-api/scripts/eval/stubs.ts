import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import { Vin } from '@/domain/value-objects/vin.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { VectorSearchResult } from '@/application/dto/vector/VectorSearchResult.js'
import { createMcpServer, type DiagnosticsMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import type { EvalCase } from './cases.js'

/**
 * Dobles de los puertos externos para la bateria de evaluacion.
 *
 * Regla que gobierna este fichero: **stub solo lo que sale del proceso** (OBD,
 * LanceDB, buscador web). Todo lo demas — servidor MCP, formateo de tools,
 * envoltorio untrusted, use case — es el de produccion. Si la bateria probara
 * una copia del saneador en vez del saneador, no probaria nada.
 *
 * No se reutiliza `diagnosisServiceTestFactories.ts` porque importa `vi` de
 * vitest y revienta fuera del runner. Los valores del vehiculo si se copian de
 * `composition.ts::audiScenario`, para que bateria y tests hablen del mismo coche.
 */

/** Mismo vehiculo que el escenario `audi-a3-tdi` de produccion. */
export const EVAL_VEHICLE = new VehicleInfo({
  make: 'Audi',
  model: 'A3',
  year: 2018,
  engineType: '2.0 TDI',
  vin: new Vin('WAUZZZ8V5JA123456'),
})

/** Lecturas Mode 01 por defecto: un motor caliente al ralenti, sin nada raro. */
const DEFAULT_PID_VALUES: Readonly<Record<string, number>> = {
  '04': 32, // carga calculada (%)
  '05': 89, // temperatura de refrigerante (C)
  '0B': 101, // presion de colector (kPa)
  '0C': 820, // regimen (rpm)
  '0D': 0, // velocidad (km/h)
  '0F': 24, // temperatura de admision (C)
  '10': 3.2, // caudal MAF (g/s)
  '11': 14, // posicion del acelerador (%)
  '2F': 55, // nivel de combustible (%)
  '42': 14.1, // tension del modulo (V)
}

const DEFAULT_DTCS = [new DtcCode({ code: 'P0301', description: 'Cylinder 1 Misfire Detected' })]

/**
 * `ObdRepository` en memoria con los valores del Audi A3.
 *
 * Cubre el puerto entero: las tools de diagnostico llaman a metodos que un caso
 * concreto no ha previsto, y un `undefined` ahi da un error de runtime que se
 * confunde con un fallo del agente.
 */
export function createStubObdRepository(): ObdRepository {
  return {
    readPid: async (_mode, pid) => DEFAULT_PID_VALUES[pid.toUpperCase()] ?? 0,
    readPidWithBytes: async (_mode, pid) => ({
      value: DEFAULT_PID_VALUES[pid.toUpperCase()] ?? 0,
      bytes: [0x00, 0x00],
    }),
    readPids: async (_mode, pids) =>
      new Map(pids.map((p) => [p.toUpperCase(), DEFAULT_PID_VALUES[p.toUpperCase()] ?? 0])),
    readPidRaw: async () => [0x00, 0x00],
    getSupportedPids: async () => Object.keys(DEFAULT_PID_VALUES),
    getFreezeFrame: async (dtc) =>
      new FreezeFrame({
        dtcCode: dtc ?? 'P0301',
        pidValues: { '05': 91, '0C': 1450, '0D': 48, '11': 31 },
      }),
    readDtcCodes: async () => [...DEFAULT_DTCS],
    clearDtcCodes: async () => undefined,
    readPendingDtcCodes: async () => [],
    readPermanentDtcCodes: async () => [],
    readVin: async () => 'WAUZZZ8V5JA123456',
    getVehicleInfo: async () => EVAL_VEHICLE,
    getEcuInfo: async () => [
      new EcuInfo({
        id: 1,
        vehicleId: 1,
        name: 'Engine Control Module',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'engine',
        protocol: 'ISO 15765-4 CAN',
      }),
    ],
    getVehicleStatus: async () => VehicleStatus.clean('compression'),
    setPower: async () => undefined,
  }
}

/** Entrada de catalogo sintetica, con el texto que el caso quiera sembrar. */
function catalogHit(text: string): VectorSearchResult<DiagnosisKnowledgeEntry> {
  return {
    entry: {
      id: 'eval-catalog-1',
      embeddedText: text,
      manufacturer: EVAL_VEHICLE.make,
      model: EVAL_VEHICLE.model,
      symptoms: [],
      pidsInvolved: [],
      confidence: 0.6,
      source: KnowledgeSource.PreviousDiagnosis,
    },
    distance: 0.31,
  }
}

/**
 * Los cuatro indices vectoriales, sin LanceDB ni modelo de embeddings.
 *
 * `catalogText` es el canal de inyeccion persistente (caso C6): simula lo que
 * otro usuario sembro en el catalogo y que `search_similar_*` devuelve sin
 * filtrar por usuario.
 */
export function createStubKnowledgeStack(catalogText?: string): KnowledgeStack {
  const emptyIndex = { index: async () => undefined, search: async () => [] }
  return {
    pidsIndex: { ...emptyIndex },
    dtcsIndex: { ...emptyIndex },
    ecusIndex: { ...emptyIndex },
    diagnosisIndex: {
      index: async () => undefined,
      search: async () => (catalogText ? [catalogHit(catalogText)] : []),
    },
  } as KnowledgeStack
}

/** Buscador web que devuelve el snippet del caso (canal de inyeccion C4). */
export function createStubWebSearch(snippet?: string): WebSearchPort {
  return {
    search: async (query) => [
      {
        title: `Resultado para "${query}"`,
        snippet: snippet ?? 'Sin resultados relevantes.',
        url: 'https://example.invalid/foro/hilo-1',
      },
    ],
  }
}

/** Logger silencioso: la bateria imprime su propio informe y el ruido tapa las respuestas. */
export const silentLogger: LoggerPort = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
}

/** Prefijo reservado en `EvalCase.obd` para que una tool falle en vez de responder. */
const ERROR_FIXTURE_KEY = '__error'

/** Dependencias cableadas de un caso: servidor MCP e indice de casos previos. */
export interface EvalHarness {
  readonly mcp: DiagnosticsMcpServer
  /** El mismo indice que ven las tools, para que C6 llegue por los dos caminos. */
  readonly knowledge: KnowledgeStack
}

/**
 * Servidor MCP de produccion con los puertos stub, mas el override de fixtures.
 *
 * `listTools()` devuelve las definiciones reales — que es lo que decide como
 * razona el modelo — y las tools de conocimiento y web pasan por su formateo y
 * su envoltorio untrusted de verdad. El override solo tapa las respuestas OBD,
 * porque un caso quiere "105 grados" sin montar un emulador.
 *
 * El `KnowledgeStack` se devuelve ademas de inyectarse: el use case lo usa por
 * su cuenta para la seccion "Casos similares previos", asi que ambos caminos
 * tienen que compartir instancia o el caso C6 solo se probaria a medias.
 */
export function createEvalHarness(evalCase: EvalCase): EvalHarness {
  const knowledge = createStubKnowledgeStack(evalCase.catalogText)
  const mcp = createMcpServer(
    createStubObdRepository(),
    undefined,
    knowledge,
    createStubWebSearch(evalCase.webSnippet),
  )
  const fixtures = evalCase.obd
  if (!fixtures) return { mcp, knowledge }

  const overridden: DiagnosticsMcpServer = {
    ...mcp,
    callTool: async (name, args) => {
      const error = fixtures[ERROR_FIXTURE_KEY]
      if (typeof error === 'string') throw new Error(error)
      const fixture = fixtures[name]
      if (fixture === undefined) return mcp.callTool(name, args)
      return { content: [{ type: 'text', text: String(fixture) }], isError: false }
    },
  }
  return { mcp: overridden, knowledge }
}

/** Cliente LLM decorado que conserva la respuesta cruda de la ultima llamada. */
export interface CapturingLlmClient {
  readonly client: LlmClientPort
  /** Texto tal cual lo emitio el modelo, antes de que el use case lo limpie. */
  lastRawText(): string
}

/**
 * Envuelve el cliente LLM para quedarse con el texto crudo.
 *
 * Sin esto no se distingue "el modelo no emitio el bloque JSON" (y la severidad
 * que se ve es la del fallback) de "lo emitio bien": el use case devuelve los
 * mismos valores en ambos casos. Es el invariante INV-2.
 */
export function createCapturingLlmClient(inner: LlmClientPort): CapturingLlmClient {
  let raw = ''
  return {
    client: {
      sendMessage: async (input, handler): Promise<LlmResponse> => {
        const response = await inner.sendMessage(input, handler)
        raw = response.text
        return response
      },
      sendSingleMessage: (input) => inner.sendSingleMessage(input),
    },
    lastRawText: () => raw,
  }
}
