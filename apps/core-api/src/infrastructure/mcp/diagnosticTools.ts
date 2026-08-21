import { z } from 'zod'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { persistDiscoveredEcus } from '@/application/shared/persistDiscoveredEcus.js'
import {
  AUTO_DISCOVERY_PID_DATA_BYTES,
  AUTO_DISCOVERY_PID_FORMULA,
} from '@/domain/catalogs/pidCatalog.js'
import { PidCode } from '@/domain/value-objects/PidCode.js'
import { PidDefinition } from '@/domain/entities/PidDefinition.js'
import { PidReading } from '@/domain/entities/PidReading.js'
import { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { loadEcuDefinitionLookup } from '@/application/ecu-catalog/loadEcuDefinitionLookup.js'
import { resolveEcuDefinitions } from '@/application/ecu-catalog/resolveEcuDefinitions.js'
import {
  text,
  withErrorHandling,
  type ToolHandler,
  type ToolRegistrar,
} from '@/infrastructure/mcp/mcpToolkit.js'

/**
 * Contexto opcional de sesion de diagnostico para persistencia MCP.
 *
 * `sessionId` habilita {@link persistPidReading}; `vehicleId` habilita
 * {@link persistDiscoveredEcus}. `manufacturer`/`model` habilitan la deduplicacion
 * de PIDs y DTCs por fabricante/modelo. Todos son `undefined` cuando el MCP
 * se usa fuera de una sesion de diagnostico (ej. `callMcpTool` directo).
 */
export interface SessionContext {
  readonly sessionId?: number
  readonly vehicleId?: number
  readonly manufacturer?: string
  readonly model?: string
}

/**
 * Confianza con la que se registra un PID auto-descubierto.
 *
 * Es politica del catalogo auto-expansivo, no normativa: la formula asumida
 * ({@link AUTO_DISCOVERY_PID_FORMULA}) acierta el tamano y el orden de los bytes,
 * pero no el factor de escala, asi que la lectura vale como pista y no como dato
 * confirmado hasta que la valide {@link ValidateDiscoveredPidUseCase}.
 */
const AUTO_DISCOVERY_CONFIDENCE = 0.3

function autoRegisterPid(
  vehicleRepo: VehicleRepository,
  modeStr: string,
  pidStr: string,
  manufacturer?: string,
  model?: string,
): void {
  void vehicleRepo
    .findPidDefinition(modeStr, pidStr, manufacturer, model)
    .then((existing) => {
      if (existing) return
      return vehicleRepo.insertPidDefinition(
        new PidDefinition({
          id: 0,
          pidCode: new PidCode(modeStr, pidStr),
          name: `${modeStr} ${pidStr}`,
          formula: AUTO_DISCOVERY_PID_FORMULA,
          dataBytes: AUTO_DISCOVERY_PID_DATA_BYTES,
          pidType: 'formula',
          manufacturer,
          model,
          confidence: AUTO_DISCOVERY_CONFIDENCE,
          source: 'auto',
        }),
      )
    })
    .catch(() => {
      // best-effort
    })
}

/** Datos necesarios para persistir una lectura de PID en sesion activa. */
interface PidPersistenceContext {
  readonly vehicleRepo: VehicleRepository
  readonly sessionContext: SessionContext
  readonly modeStr: string
  readonly pidStr: string
  readonly value: number
  /** Bytes crudos de la misma lectura: no se vuelve a preguntar al vehiculo por ellos. */
  readonly bytes: readonly number[]
}

/** Bytes de datos que se asumen cuando el PID no esta en el catalogo. */
const DEFAULT_PID_DATA_BYTES = 2

/**
 * Hex crudo de una lectura, recortado a los bytes que el PID declara.
 *
 * Devuelve `'00'` cuando no hay bytes: un adaptador que no los entrega no debe
 * impedir que se guarde el valor, que es lo que el mecanico acaba viendo.
 */
function toRawHex(bytes: readonly number[], dataBytes: number): string {
  const sliced = dataBytes > 0 ? bytes.slice(0, dataBytes) : bytes
  const hex = sliced.map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex === '' ? '00' : hex
}

/**
 * Persiste una lectura de PID en la sesion de diagnostico activa (fire-and-forget).
 *
 * Busca la definicion del PID para obtener `pidDefId` y `dataBytes`, luego
 * intenta leer los bytes crudos del OBD. Si cualquiera de estos pasos falla,
 * se persiste con `rawHex = '00'` (fallback: "sin datos crudos disponibles").
 */
function persistPidReading(ctx: PidPersistenceContext): void {
  const sessionId = ctx.sessionContext.sessionId
  if (sessionId === undefined) return
  void ctx.vehicleRepo
    .findPidDefinition(ctx.modeStr, ctx.pidStr)
    .then(async (definition) => {
      const pidDefId = definition?.id
      const rawHex = toRawHex(ctx.bytes, definition?.dataBytes ?? DEFAULT_PID_DATA_BYTES)
      await ctx.vehicleRepo.insertPidReading(
        new PidReading({
          id: 0,
          pidDefId,
          mode: ctx.modeStr,
          pidCode: ctx.pidStr,
          sessionId,
          rawHex,
          parsedValue: ctx.value,
        }),
      )
    })
    .catch(() => {
      // best-effort: never let persistence failure bubble up to the LLM
    })
}

/** Lo observado al leer un PID, con el repositorio de persistencia si lo hay. */
interface PidObservation {
  readonly vehicleRepo: VehicleRepository | undefined
  readonly sessionContext: SessionContext | undefined
  readonly modeStr: string
  readonly pidStr: string
  readonly value: number
  /** Bytes crudos de la misma lectura, para persistir el hex sin releer el PID. */
  readonly bytes: readonly number[]
}

/**
 * Efectos de lado de leer un PID: auto-registro en el catalogo (solo fuera de
 * Mode 01) y persistencia de la lectura si hay sesion activa. Ambos best-effort.
 *
 * Vive aparte del handler para que este tenga una sola responsabilidad visible:
 * leer y devolver el valor. Sin repositorio no hay nada que registrar, y esa
 * decision se toma una vez aqui en lugar de en cada guarda.
 */
function recordPidObservation(observation: PidObservation): void {
  const { vehicleRepo, sessionContext, modeStr, pidStr, value, bytes } = observation
  if (!vehicleRepo) return

  autoRegisterIfProprietary(vehicleRepo, modeStr, pidStr, sessionContext)

  if (sessionContext?.sessionId === undefined) return
  persistPidReading({ vehicleRepo, sessionContext, modeStr, pidStr, value, bytes })
}

/** Auto-registra en el catalogo los PID propietarios (todo lo que no es Mode 01). */
function autoRegisterIfProprietary(
  vehicleRepo: VehicleRepository,
  modeStr: string,
  pidStr: string,
  sessionContext: SessionContext | undefined,
): void {
  if (modeStr === '01') return
  autoRegisterPid(vehicleRepo, modeStr, pidStr, sessionContext?.manufacturer, sessionContext?.model)
}

function handleReadPid(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): ToolHandler {
  return async ({ mode, pid }) => {
    const modeStr = `${mode}`
    const pidStr = `${pid}`
    // Una sola interrogacion al vehiculo: el valor para el mecanico y los bytes
    // para el historial salen de la misma respuesta.
    const { value, bytes } = await repo.readPidWithBytes(modeStr, pidStr)

    recordPidObservation({ vehicleRepo, sessionContext, modeStr, pidStr, value, bytes })

    return text(String(value))
  }
}

/**
 * Persiste definiciones de DTC en el catalogo auto-expansivo (fire-and-forget).
 *
 * Solo ejecuta si `sessionContext` tiene `manufacturer` y `model` validos.
 */
function persistDtcs(
  vehicleRepo: VehicleRepository,
  sessionContext: SessionContext,
  dtcs: ReadonlyArray<{ code: string; description?: string }>,
): void {
  if (!sessionContext.manufacturer || !sessionContext.model) return
  void Promise.all(
    dtcs.map((dtc) =>
      vehicleRepo.upsertDtcDefinition({
        manufacturer: sessionContext.manufacturer!,
        model: sessionContext.model!,
        code: dtc.code,
        description: dtc.description,
        confidence: 0.5,
        source: 'auto',
      }),
    ),
  ).catch(() => {
    // best-effort
  })
}

function handleGetDtcCodes(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): ToolHandler {
  return async () => {
    const dtcs = await repo.readDtcCodes()

    // Persistir DTC definitions si hay sesion activa. La comprobacion de
    // manufacturer/model ya la hace persistDtcs: repetirla aqui era la misma
    // guarda escrita dos veces.
    if (vehicleRepo && sessionContext) {
      persistDtcs(vehicleRepo, sessionContext, dtcs)
    }

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

function handleGetEcuInfo(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): ToolHandler {
  return async () => {
    const ecus = await repo.getEcuInfo()
    if (ecus.length === 0) return text('No ECUs discovered.')

    const resolved = await resolveDiscoveredEcus(vehicleRepo, sessionContext, ecus)

    // Persistir ECUs descubiertas si hay sesion activa (fire-and-forget)
    if (vehicleRepo && sessionContext?.vehicleId !== undefined) {
      void persistDiscoveredEcus(vehicleRepo, sessionContext.vehicleId, resolved).catch(() => {})
    }

    return text(
      resolved
        .map((e) => `${e.name} (${e.type}, ${e.requestAddr}→${e.responseAddr}) — ${e.protocol}`)
        .join('\n'),
    )
  }
}

/**
 * Resuelve las ECUs `UNKNOWN` del auto-scan contra el catalogo `ecu_definitions`.
 *
 * La resolucion requiere `manufacturer`/`model` en el `sessionContext`: sin ellos (o sin
 * repositorio) devuelve las ECUs tal cual. Carga las definiciones de las direcciones
 * `UNKNOWN` y delega en {@link resolveEcuDefinitions} (funcion pura) el filtrado por
 * confianza.
 */
async function resolveDiscoveredEcus(
  vehicleRepo: VehicleRepository | undefined,
  sessionContext: SessionContext | undefined,
  ecus: readonly EcuInfo[],
): Promise<EcuInfo[]> {
  if (!vehicleRepo || !sessionContext) return [...ecus]
  const { manufacturer, model } = sessionContext
  if (!manufacturer || !model) return [...ecus]

  const lookup = await loadEcuDefinitionLookup(vehicleRepo, manufacturer, model, ecus)
  return resolveEcuDefinitions(ecus, lookup)
}

function formatPidLine(p: PidDefinition): string {
  return `${p.pidCode.mode} ${p.pidCode.pid}: ${p.name} (${p.formula.toString()}) [${p.unit ?? ''}]`
}

/** Escanea los PIDs Mode 01 soportados (J1979 PID 00) y los formatea como lineas. */
async function scanSupportedPidLines(repo: ObdRepository): Promise<string[]> {
  try {
    const supported = await repo.getSupportedPids()
    return supported.map((p) => `${p} (Mode 01)`)
  } catch {
    // Escaneo fallido (ej. coche no conectado) — continuamos con la BD
    return []
  }
}

/** Formatea los PIDs del fabricante/modelo de la sesion (vacio si no hay sesion o falta el scope). */
async function scopedPidLines(
  vehicleRepo: VehicleRepository,
  sessionContext: SessionContext | undefined,
): Promise<string[]> {
  if (sessionContext === undefined) return []
  if (!sessionContext.manufacturer || !sessionContext.model) return []
  return (
    await vehicleRepo.findPidsByManufacturerModel(sessionContext.manufacturer, sessionContext.model)
  ).map(formatPidLine)
}

/** Formatea los PIDs del catalogo desde BD: Mode 22 global + fabricante/modelo de la sesion. */
async function catalogPidLines(
  vehicleRepo: VehicleRepository | undefined,
  sessionContext: SessionContext | undefined,
): Promise<string[]> {
  if (!vehicleRepo) return []

  const lines = (await vehicleRepo.findPidsByMode('22')).map(formatPidLine)
  lines.push(...(await scopedPidLines(vehicleRepo, sessionContext)))

  return lines
}

function handleGetAvailablePids(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): ToolHandler {
  return async () => {
    const lines = [
      ...(await scanSupportedPidLines(repo)),
      ...(await catalogPidLines(vehicleRepo, sessionContext)),
    ]
    if (lines.length === 0) return text('No PIDs discovered. Try read_pid with specific mode/pid.')
    return text(lines.join('\n'))
  }
}

/** Registra las tools de diagnostico OBD-II sobre el repositorio inyectado. */
// eslint-disable-next-line max-lines-per-function -- lista declarativa de registro (complejidad 1)
export function registerDiagnosticTools(
  register: ToolRegistrar,
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): void {
  register(
    'read_pid',
    'Read an OBD-II PID value. Read-only services only: 01, 02, 03, 05, 06, 07, 09, 0A, 22 ' +
      '(22 for manufacturer-specific DIDs). Control services such as 2F, 31 or 11 are rejected — ' +
      'a PID code always goes in "pid", never in "mode".',
    { mode: z.string(), pid: z.string() },
    withErrorHandling(handleReadPid(repo, vehicleRepo, sessionContext)),
  )
  register(
    'get_dtc_codes',
    'Read stored Diagnostic Trouble Codes (Service 03).',
    {},
    withErrorHandling(handleGetDtcCodes(repo, vehicleRepo, sessionContext)),
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
    'List PIDs supported by the connected vehicle. Scans Mode 01 via PID 00 bitmask and reads stored Mode 22 PIDs from catalog.',
    {},
    withErrorHandling(handleGetAvailablePids(repo, vehicleRepo, sessionContext)),
  )
  register(
    'get_ecu_info',
    'List discovered ECUs (names, CAN addresses, protocol).',
    {},
    withErrorHandling(handleGetEcuInfo(repo, vehicleRepo, sessionContext)),
  )
}
