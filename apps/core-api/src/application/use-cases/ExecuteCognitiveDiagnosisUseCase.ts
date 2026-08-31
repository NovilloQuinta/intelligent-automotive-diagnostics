import crypto from 'node:crypto'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { parseCognitiveDiagnosis, JSON_BLOCK_REGEX } from '@/application/llm/extractLlmDiagnosis.js'
import { EmptyDiagnosisError } from '@/application/llm/llmErrors.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { McpToolDefinition } from '@/application/dto/llm/McpToolDefinition.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import type { ExecuteCognitiveDiagnosisInput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisInput.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import type { DiagnosisVectorRepository } from '@/application/ports/DiagnosisVectorRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { VectorSearchResult } from '@/application/dto/vector/VectorSearchResult.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import { initialConfidenceFor } from '@/application/knowledge/confidenceScale.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'
import { DEFAULT_SEARCH_LIMIT } from '@/application/knowledge/createKnowledgeIndex.js'
import { derivePidObservations } from '@/application/obd/pidObservationEnricher.js'
import { READ_PID_TOOL } from '@/application/shared/mcpToolNames.js'
import { redactInternals } from '@/application/llm/redactInternals.js'
import { stripMetaPreamble } from '@/application/llm/stripMetaPreamble.js'
import { COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT } from '@/application/prompts/cognitiveDiagnosisPrompt.js'
import { VALUATION_SYSTEM_PROMPT } from '@/application/prompts/valuationPrompt.js'
import { ECU_IDENTIFICATION_SYSTEM_PROMPT } from '@/application/prompts/ecuIdentificationPrompt.js'
import {
  classifyDiagnosisScope,
  DIAGNOSIS_SCOPE,
  OFF_TOPIC_RESPONSE,
  HEALTH_REDIRECT_RESPONSE,
} from '@/application/llm/classifyDiagnosisScope.js'
import { Severity } from '@/domain/value-objects/DiagnosisResult.js'
import type { LlmResponse } from '@/application/dto/llm/LlmResponse.js'

function buildUserMessage(
  userQuery: string | undefined,
  vehicleContext: VehicleInfo | undefined,
  similarCases?: string,
): string {
  const contextLine = vehicleContext
    ? `Vehículo: ${vehicleContext.make} ${vehicleContext.model} (${vehicleContext.year}), motor ${vehicleContext.engineType}, VIN ${vehicleContext.vin}`
    : 'No se dispone de información del vehículo.'
  const queryLine = userQuery?.trim()
    ? `Consulta del usuario: ${userQuery.trim()}`
    : 'Realiza un diagnóstico general del vehículo.'
  const base = `${contextLine}\n${queryLine}`
  return similarCases ? `${base}\n\n${similarCases}` : base
}

/**
 * Detecta una narrativa que es, entera, una "palabra de confirmacion" en mayusculas.
 *
 * Exige al menos una letra para no disparar con un DTC suelto tipo "P0301" (que sí
 * puede ser mayuscula legitima) sin cuerpo de frase alrededor, y un tope de longitud
 * para no atrapar un titular corto pero real. Case-sensitive a proposito: una frase
 * normal en espanol mezcla mayusculas y minusculas.
 */
const MAX_SHOUT_LENGTH = 60

function isShoutedConfirmation(text: string): boolean {
  return text.length <= MAX_SHOUT_LENGTH && /[A-ZÁÉÍÓÚÑ]/.test(text) && text === text.toUpperCase()
}

/** Umbrales de la etiqueta de parecido (distancia vectorial: menor es mas parecido). */
const VERY_SIMILAR_MAX_DISTANCE = 0.5
const SIMILAR_MAX_DISTANCE = 1.0

/**
 * Traduce la distancia vectorial a una etiqueta cualitativa.
 *
 * El modelo necesita la senal de relevancia para priorizar hipotesis, pero no el
 * numero: al verlo en su propio prompt lo repetia en la narrativa ("distancia
 * 1.40-1.65"), que es ruido para el mecanico.
 */
function similarityLabel(distance: number): string {
  if (distance < VERY_SIMILAR_MAX_DISTANCE) return 'muy similar'
  if (distance < SIMILAR_MAX_DISTANCE) return 'similar'
  return 'relacionado'
}

/** Formatea un resultado de busqueda vectorial como linea numerada para el prompt. */
function formatSimilarCase(
  result: VectorSearchResult<DiagnosisKnowledgeEntry>,
  index: number,
): string {
  return `${index}. [${similarityLabel(result.distance)}] ${result.entry.embeddedText}`
}

/**
 * Construye la seccion "Casos similares previos" a partir de los resultados.
 *
 * Va envuelta en `<untrusted-catalog-result>` porque el catalogo lo alimentan
 * otros usuarios: `indexResolvedCase` persiste la narrativa y la consulta del
 * usuario, y `search_similar_*` no filtra por usuario. Sin el delimitador, un
 * texto sembrado por un usuario llega como instruccion al prompt de otro.
 */
function buildSimilarCasesSection(
  results: readonly VectorSearchResult<DiagnosisKnowledgeEntry>[],
): string {
  if (results.length === 0) return ''
  const lines = results.map((r, i) => formatSimilarCase(r, i + 1))
  return [
    'Casos similares previos:',
    '<untrusted-catalog-result>',
    ...lines,
    '</untrusted-catalog-result>',
  ].join('\n')
}

const UNKNOWN_VALUE = 'unknown'

/** Extrae los PID unicos leidos durante el diagnostico a partir de las trazas de tool calls. */
function toUniquePids(toolCalls: readonly ToolCallTrace[]): string[] {
  const pids = toolCalls.filter((tc) => tc.tool === READ_PID_TOOL).map((tc) => String(tc.args.pid))
  return [...new Set(pids)]
}

/** Construye una entrada de conocimiento a partir del resultado del diagnostico. */
function toDiagnosisEntry(
  text: string,
  toolCalls: readonly ToolCallTrace[],
  userQuery: string | undefined,
  vehicleContext: VehicleInfo | undefined,
): DiagnosisKnowledgeEntry {
  return {
    id: crypto.randomUUID(),
    embeddedText: text,
    manufacturer: vehicleContext?.make ?? UNKNOWN_VALUE,
    model: vehicleContext?.model ?? UNKNOWN_VALUE,
    symptoms: userQuery?.trim() ? [userQuery.trim()] : [],
    pidsInvolved: toUniquePids(toolCalls),
    confidence: initialConfidenceFor(KnowledgeSource.PreviousDiagnosis),
    source: KnowledgeSource.PreviousDiagnosis,
  }
}

/**
 * Opciones de configuración para {@link ExecuteCognitiveDiagnosisUseCase}.
 * Sigue el patrón de objeto de opciones para que sea facil añadir nuevas dependencias
 * opcionales (como repositorios RAG) sin romper la firma del constructor.
 */
export interface ExecuteCognitiveDiagnosisUseCaseOptions {
  /** Cliente LLM que gestiona el ciclo completo de tool calling. */
  readonly llmClient: LlmClientPort
  /** Definiciones de herramientas MCP expuestas al LLM. */
  readonly tools: readonly McpToolDefinition[]
  /** Manejador que ejecuta llamadas a herramientas MCP. */
  readonly handler: ToolCallHandlerPort
  /** Logger para registrar advertencias y errores. */
  readonly logger: LoggerPort
  /** Repositorio vectorial opcional para inyeccion de conocimiento RAG. */
  readonly diagnosisIndex?: DiagnosisVectorRepository
}

/** Caso de uso: diagnostico cognitivo via LLM + tool calling MCP. */
export class ExecuteCognitiveDiagnosisUseCase {
  /**
   * @param options - Objeto de opciones con cliente LLM, herramientas
   *   MCP, manejador de tool calls, logger y repositorio RAG opcional.
   */
  constructor(private readonly options: ExecuteCognitiveDiagnosisUseCaseOptions) {}

  /**
   * Ejecuta el diagnostico cognitivo: recupera casos similares, envia el prompt al LLM con
   * tool calling, parsea el bloque JSON final e indexa el caso resuelto.
   *
   * @param input — Consulta del usuario, contexto del vehiculo e historial de conversacion
   * @returns Diagnostico (narrativa + severidad + confianza + recomendaciones) y traza de tools
   */
  async execute(input: ExecuteCognitiveDiagnosisInput): Promise<ExecuteCognitiveDiagnosisOutput> {
    const { userQuery, vehicleContext, conversationHistory } = input

    // Filtro de ambito ANTES de nada, sin tools: dejarselo al prompt grande resulto
    // poco fiable en la bateria de eval.
    const scope = await classifyDiagnosisScope(userQuery, this.options.llmClient)
    if (scope === DIAGNOSIS_SCOPE.Salud || scope === DIAGNOSIS_SCOPE.FueraDeAmbito) {
      return this.offTopicOutput(scope)
    }
    if (scope === DIAGNOSIS_SCOPE.Valoracion) {
      return this.executeValuation(userQuery, vehicleContext)
    }
    if (scope === DIAGNOSIS_SCOPE.IdentificacionEcu) {
      return this.executeEcuIdentification(userQuery, vehicleContext)
    }

    const similarCases = await this.retrieveSimilarCases(userQuery, vehicleContext)
    const userMessage = buildUserMessage(userQuery, vehicleContext, similarCases)

    const response = await this.options.llmClient.sendMessage(
      {
        systemPrompt: COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT,
        userMessage,
        tools: this.options.tools,
        conversationHistory,
      },
      this.options.handler,
    )

    const output = this.buildOutput(response)
    await this.indexResolvedCase(output.diagnosis, response.toolCalls, userQuery, vehicleContext)
    return output
  }

  /** Respuesta fija, sin llamar al LLM grande, para salud/fuera de ambito. */
  private offTopicOutput(
    scope: typeof DIAGNOSIS_SCOPE.Salud | typeof DIAGNOSIS_SCOPE.FueraDeAmbito,
  ): ExecuteCognitiveDiagnosisOutput {
    return {
      diagnosis: scope === DIAGNOSIS_SCOPE.Salud ? HEALTH_REDIRECT_RESPONSE : OFF_TOPIC_RESPONSE,
      severity: Severity.Low,
      confidence: 0,
      recommendations: [],
      toolCalls: [],
      pidObservations: [],
    }
  }

  /** Prompt corto dedicado a valoraciones; no se indexa, no es un diagnostico. */
  private async executeValuation(
    userQuery: string | undefined,
    vehicleContext: VehicleInfo | undefined,
  ): Promise<ExecuteCognitiveDiagnosisOutput> {
    const userMessage = buildUserMessage(userQuery, vehicleContext)
    const response = await this.options.llmClient.sendMessage(
      { systemPrompt: VALUATION_SYSTEM_PROMPT, userMessage, tools: this.options.tools },
      this.options.handler,
    )
    return this.buildOutput(response)
  }

  /**
   * Prompt corto dedicado a identificar ECU concretas; no se indexa como diagnostico
   * (el propio `index_ecu` que llame el modelo persiste el catalogo por su cuenta).
   */
  private async executeEcuIdentification(
    userQuery: string | undefined,
    vehicleContext: VehicleInfo | undefined,
  ): Promise<ExecuteCognitiveDiagnosisOutput> {
    const userMessage = buildUserMessage(userQuery, vehicleContext)
    const response = await this.options.llmClient.sendMessage(
      { systemPrompt: ECU_IDENTIFICATION_SYSTEM_PROMPT, userMessage, tools: this.options.tools },
      this.options.handler,
    )
    return this.buildOutput(response)
  }

  /**
   * Parsea y sanea la respuesta cruda del LLM en el output final del caso de uso.
   *
   * @throws {EmptyDiagnosisError} Si no queda narrativa legible tras sanear, o si es
   *   solo una "palabra de confirmacion" en mayusculas (ver {@link isShoutedConfirmation}).
   */
  private buildOutput(response: LlmResponse): ExecuteCognitiveDiagnosisOutput {
    const { text, toolCalls } = response
    const parsed = parseCognitiveDiagnosis(text)
    // Saneado ANTES de indexar: si el corpus se contamina, el ruido vuelve en
    // futuros prompts como "caso similar" y se retroalimenta.
    const cleanedText = redactInternals(
      stripMetaPreamble(text.replace(JSON_BLOCK_REGEX, '').trim()),
    )
    // Toda en mayusculas es la forma real de un secuestro de formato (`PWNED`,
    // `MODO LIBRE ACTIVADO`...) que el prompt no siempre frena por si solo.
    if (cleanedText === '' || isShoutedConfirmation(cleanedText)) throw new EmptyDiagnosisError()

    return {
      diagnosis: cleanedText,
      severity: parsed.severity,
      confidence: parsed.confidence,
      recommendations: parsed.recommendations,
      toolCalls,
      pidObservations: derivePidObservations(toolCalls),
    }
  }

  /** Construye y persiste el caso resuelto si el indice vectorial esta presente. */
  private async indexResolvedCase(
    text: string,
    toolCalls: readonly ToolCallTrace[],
    userQuery: string | undefined,
    vehicleContext: VehicleInfo | undefined,
  ): Promise<void> {
    const diagnosisIndex = this.options.diagnosisIndex
    if (!diagnosisIndex) return

    const entry = toDiagnosisEntry(text, toolCalls, userQuery, vehicleContext)

    try {
      await diagnosisIndex.index(entry)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.options.logger.warn('Failed to index resolved case, continuing', {
        error: message,
      })
    }
  }

  /**
   * Busca casos similares en el indice vectorial y los formatea para inyectar
   * en el prompt del LLM. Devuelve cadena vacia si no hay indice o resultados.
   */
  private async retrieveSimilarCases(
    userQuery: string | undefined,
    vehicleContext: VehicleInfo | undefined,
  ): Promise<string> {
    const diagnosisIndex = this.options.diagnosisIndex
    if (!diagnosisIndex) return ''

    const query = userQuery?.trim()
      ? userQuery.trim()
      : vehicleContext
        ? `diagnóstico general ${vehicleContext.make} ${vehicleContext.model}`
        : 'diagnóstico general'

    const filter = vehicleContext
      ? { manufacturer: vehicleContext.make, model: vehicleContext.model }
      : undefined

    try {
      const results = await diagnosisIndex.search(query, {
        limit: DEFAULT_SEARCH_LIMIT,
        filter,
      })
      return buildSimilarCasesSection(results)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      this.options.logger.warn('RAG search failed, continuing without similar cases', {
        error: message,
      })
      return ''
    }
  }
}
