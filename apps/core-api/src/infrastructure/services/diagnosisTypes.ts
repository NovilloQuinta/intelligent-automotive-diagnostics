import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { LlmClientPort } from '@/application/ports/LlmClientPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { KnowledgeStackPort } from '@/application/ports/KnowledgeStackPort.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { ExecuteCognitiveDiagnosisOutput } from '@/application/dto/diagnosis/ExecuteCognitiveDiagnosisOutput.js'
import type { Severity } from '@/domain/value-objects/DiagnosisResult.js'
import { LiveData } from '@/domain/value-objects/LiveData.js'
import type { DtcCode } from '@/domain/value-objects/DtcCode.js'
import { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/Vin.js'
import { DiagnosisSession } from '@/domain/entities/DiagnosisSession.js'
import { ALL_SEED_PIDS } from '@/domain/pidCatalog.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'

/** Timeout por defecto del diagnostico cognitivo (60 s). */
export const COGNITIVE_DIAGNOSIS_TIMEOUT_MS = 60_000

/**
 * Metadatos de presentación (nombre + unidad) de los PIDs Mode 01 del catálogo
 * {@link ALL_SEED_PIDS}, indexados por código hex (ej. "0C" → "Engine RPM"/"rpm").
 *
 * Se usa `ALL_SEED_PIDS` (en inglés, SAE J1979) y no `PID_OBSERVATION_CATALOG`
 * (español) porque este último solo define 7 PIDs y la respuesta genérica
 * `readings` debe cubrir los 16 Mode 01 para poder mostrar un gauge por PID.
 */
export const PID_METADATA: ReadonlyMap<string, { readonly name: string; readonly unit: string }> =
  new Map(
    ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => [
      p.pidCode.pid,
      { name: p.name, unit: p.unit ?? '' },
    ]),
  )

/** Nombre de la tool MCP que devuelve los códigos DTC detectados en el vehículo. */
export const GET_DTC_CODES_TOOL = 'get_dtc_codes'

/** Descriptor de un escenario de vehiculo disponible para diagnostico. */
export interface ScenarioDescriptor {
  readonly id: string
  readonly name: string
  readonly vehicleType: 'car' | 'motorcycle' | 'unknown'
  /** Tipo de conexión al dispositivo: WiFi (TCP/IP), USB (serial), o Bluetooth (RFCOMM — futuro). */
  readonly connectionType: 'wifi' | 'usb' | 'bluetooth'
  readonly sensorValues?: LiveData
  readonly dtcConfig?: DtcCode[]
  readonly vehicleInfo: VehicleInfo
  /** Host del emulador/dispositivo OBD (no se expone al cliente). */
  readonly host: string
  /** Puerto del emulador/dispositivo OBD (no se expone al cliente). */
  readonly port: number
}

/** Escenario sintetico expuesto cuando se opera contra un ELM327 TCP real.
 * El tipo de vehiculo se descubre al diagnosticar (coche o moto). */
export const TCP_DIRECT_SCENARIO: ScenarioDescriptor = {
  id: 'tcp',
  name: 'ELM327 Direct Connection',
  vehicleType: 'unknown',
  connectionType: 'wifi',
  sensorValues: new LiveData({ rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 }),
  dtcConfig: [],
  vehicleInfo: new VehicleInfo({
    make: 'unknown',
    model: 'unknown',
    year: 0,
    engineType: 'unknown',
    vin: new Vin(FALLBACK_VIN),
  }),
  host: '',
  port: 0,
}

/** Escenario sintetico expuesto cuando se opera contra un ELM327 USB/serial real. */
export const SERIAL_DIRECT_SCENARIO: ScenarioDescriptor = {
  id: 'serial',
  name: 'ELM327 USB Connection',
  vehicleType: 'unknown',
  connectionType: 'usb',
  sensorValues: new LiveData({ rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 }),
  dtcConfig: [],
  vehicleInfo: new VehicleInfo({
    make: 'unknown',
    model: 'unknown',
    year: 0,
    engineType: 'unknown',
    vin: new Vin(FALLBACK_VIN),
  }),
  host: '',
  port: 0,
}

/** Resultado del diagnostico determinista formateado para la API. */
export interface DiagnoseOutput {
  readonly rawData: string
  readonly parsedValues: LiveData
  readonly dtcCodes: DtcCode[]
  readonly diagnosisText: string
  readonly severity: Severity
}

/** Identificacion del vehiculo activo, con los campos derivados del VO {@link Vin}. */
export interface VehicleInfoOutput {
  readonly vin: string
  readonly make: string
  readonly model: string
  readonly year: number
  readonly engineType: string
  /** Fabricante deducido del WMI; `null` si el VIN no es decodificable. */
  readonly manufacturer: string | null
  /** Pais/region deducidos del WMI; `null` si el VIN no es decodificable. */
  readonly region: { country: string; region: string } | null
  /** Anio de modelo deducido de la posicion 10; `null` si el VIN no es decodificable. */
  readonly modelYearDecoded: number | null
  /** Estado de la lectura del VIN. */
  readonly vinStatus: 'read' | 'unsupported' | 'unreadable'
}

/** Campos decodificados vacios: VIN ausente, con ruido o {@link FALLBACK_VIN}. */
export const UNDECODED_VIN = {
  manufacturer: null,
  region: null,
  modelYearDecoded: null,
} as const

/** Telemetria en vivo con degradacion por PID: un valor `null` indica lectura fallida. */
export interface TelemetryOutput {
  rpm: number | null
  coolantTemp: number | null
  speed: number | null
  intakeTemp: number | null
}

/** Lectura genérica de un PID en la respuesta `readings` de {@link DiagnosisService.getLiveData}. */
export interface PidReading {
  /** Clave compuesta modo + PID separados por espacio (ej. "01 0C"). */
  readonly code: string
  /** Nombre legible del PID (del catálogo `ALL_SEED_PIDS`). */
  readonly name: string
  /** Unidad física del valor (ej. "rpm", "°C"). */
  readonly unit: string
  /** Valor físico resuelto; `null` si la lectura falló (NO DATA). */
  readonly value: number | null
}

/** PID Mode 01 disponible en el selector de telemetría en vivo. */
export interface AvailablePid {
  /** Clave compuesta modo + PID separados por espacio (ej. "01 0C"). */
  readonly code: string
  /** Nombre legible del PID (del catálogo `ALL_SEED_PIDS`). */
  readonly name: string
  /** Unidad física del valor (ej. "rpm", "°C"). */
  readonly unit: string
}

/** Rol de un turno dentro de la conversación persistida del diagnóstico. */
export type ConversationRole = 'user' | 'assistant'

/** Turno individual de la conversación entre mecánico y asistente IA. */
export interface ConversationTurn {
  readonly role: ConversationRole
  readonly text: string
  readonly timestamp: string
}

/** Construye un turno de conversación inmutable con marca de tiempo actual. */
export function buildConversationTurn(role: ConversationRole, text: string): ConversationTurn {
  return { role, text, timestamp: new Date().toISOString() }
}

/** Resultado del diagnóstico cognitivo, enriquecido con el id de la sesión persistida. */
export type CognitiveDiagnosisResult = ExecuteCognitiveDiagnosisOutput & {
  readonly sessionId?: number
}

/** Estado de sesión resuelto antes de ejecutar el diagnóstico cognitivo. */
export interface ResolvedDiagnosisSession {
  readonly followUpSession: DiagnosisSession | undefined
  readonly sessionId: number | undefined
  readonly vehicleId: number | undefined
}

/** Dependencias de {@link DiagnosisService}. */
export interface DiagnosisServiceOptions {
  /** Descriptores de escenarios disponibles (modo docker). */
  readonly scenarios: ScenarioDescriptor[]
  /** Mapa scenarioId → repositorio OBD en modo docker (multi-vehiculo). */
  readonly obdRepos?: Map<string, ObdRepository>
  /** Repositorio OBD unico en modo TCP directo (single-vehicle). */
  readonly obdRepo?: ObdRepository
  /** Escenario sintetico a devolver en `listScenarios()` cuando `obdRepo` está presente.
   *  Por defecto {@link TCP_DIRECT_SCENARIO}. Usar {@link SERIAL_DIRECT_SCENARIO} para USB. */
  readonly directScenario?: ScenarioDescriptor
  /** Cliente LLM; ausente deshabilita el diagnostico cognitivo. */
  readonly llmClient?: LlmClientPort
  /** Stack de conocimiento vectorial RAG; ausente deshabilita busqueda/indexado. */
  readonly knowledgeStack?: KnowledgeStackPort
  /** Puerto de búsqueda web externa; ausente deshabilita la tool `web_search`. */
  readonly webSearch?: WebSearchPort
  /** Repositorio de vehículos; ausente deshabilita `get_available_pids`. */
  readonly vehicleRepo?: VehicleRepository
  readonly logger: LoggerPort
  /** Timeout del diagnostico cognitivo en ms. Por defecto 60 s. */
  readonly cognitiveTimeoutMs?: number
  /** Timeout de una llamada a tool MCP en ms. Por defecto 10 s. */
  readonly toolCallTimeoutMs?: number
}
