import { z } from 'zod'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import { PidCode } from '@/domain/value-objects/pidCode.js'
import { PidDefinition } from '@/domain/entities/pidDefinition.js'
import { PidReading } from '@/domain/entities/pidReading.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { EcuDefinition } from '@/domain/entities/ecuDefinition.js'
import { ECU_TYPE_UNKNOWN } from '@/domain/ecuAddressCatalog.js'
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
 * {@link persistEcus}. `manufacturer`/`model` habilitan la deduplicacion
 * de PIDs y DTCs por fabricante/modelo. Todos son `undefined` cuando el MCP
 * se usa fuera de una sesion de diagnostico (ej. `callMcpTool` directo).
 */
export interface SessionContext {
  readonly sessionId?: number
  readonly vehicleId?: number
  readonly manufacturer?: string
  readonly model?: string
}

const AUTO_DISCOVERY_FORMULA = '(A*256+B)'
const AUTO_DISCOVERY_DATA_BYTES = 2
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
          formula: AUTO_DISCOVERY_FORMULA,
          dataBytes: AUTO_DISCOVERY_DATA_BYTES,
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
  readonly repo: ObdRepository
  readonly vehicleRepo: VehicleRepository
  readonly sessionContext: SessionContext
  readonly modeStr: string
  readonly pidStr: string
  readonly value: number
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
      const dataBytes = definition?.dataBytes ?? 2
      let rawHex = '00'
      try {
        const rawData = await ctx.repo.readPidRaw(ctx.modeStr, ctx.pidStr, dataBytes)
        rawHex = rawData.map((b) => b.toString(16).padStart(2, '0')).join('')
      } catch {
        // best-effort: persist with fallback rawHex
      }
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

/**
 * Persiste las ECUs descubiertas con deduplicacion por direcciones CAN.
 *
 * Usa {@link VehicleRepository.findEcuByAddress} para evitar duplicados:
 * si la ECU ya existe, actualiza `discoveredAt`; si no, la inserta.
 */
async function persistEcus(
  vehicleRepo: VehicleRepository,
  vehicleId: number,
  ecus: EcuInfo[],
): Promise<void> {
  await Promise.all(
    ecus.map(async (ecu) => {
      const existing = await vehicleRepo.findEcuByAddress(
        vehicleId,
        ecu.requestAddr,
        ecu.responseAddr,
      )
      if (existing?.id) {
        await vehicleRepo.updateEcuDiscoveredAt(existing.id)
      } else {
        await vehicleRepo.insertEcu(
          new EcuInfo({
            id: 0,
            vehicleId,
            name: ecu.name,
            requestAddr: ecu.requestAddr,
            responseAddr: ecu.responseAddr,
            type: ecu.type,
            protocol: ecu.protocol,
          }),
        )
      }
    }),
  )
}

function handleReadPid(
  repo: ObdRepository,
  vehicleRepo: VehicleRepository | undefined,
  sessionContext?: SessionContext,
): ToolHandler {
  return async ({ mode, pid }) => {
    const modeStr = `${mode}`
    const pidStr = `${pid}`
    const value = await repo.readPid(modeStr, pidStr)

    if (vehicleRepo && modeStr !== '01') {
      void autoRegisterPid(
        vehicleRepo,
        modeStr,
        pidStr,
        sessionContext?.manufacturer,
        sessionContext?.model,
      )
    }

    // Persistir lectura si hay sesion activa (fire-and-forget)
    if (vehicleRepo && sessionContext?.sessionId !== undefined) {
      persistPidReading({
        repo,
        vehicleRepo,
        sessionContext,
        modeStr,
        pidStr,
        value,
      })
    }

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

    // Persistir DTC definitions si hay sesion activa con manufacturer/model
    if (vehicleRepo && sessionContext?.manufacturer && sessionContext?.model) {
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
      void persistEcus(vehicleRepo, sessionContext.vehicleId, resolved).catch(() => {})
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
  const manufacturer = sessionContext?.manufacturer
  const model = sessionContext?.model
  if (!vehicleRepo || !manufacturer || !model) return [...ecus]

  const lookup = await loadEcuDefinitionLookup(vehicleRepo, manufacturer, model, ecus)
  return resolveEcuDefinitions(ecus, lookup)
}

/** Carga las definiciones de las ECUs `UNKNOWN` y devuelve un lookup por direccion de respuesta. */
async function loadEcuDefinitionLookup(
  vehicleRepo: VehicleRepository,
  manufacturer: string,
  model: string,
  ecus: readonly EcuInfo[],
): Promise<(responseAddr: string) => EcuDefinition | undefined> {
  const unknownAddresses = [
    ...new Set(ecus.filter((ecu) => ecu.type === ECU_TYPE_UNKNOWN).map((ecu) => ecu.responseAddr)),
  ]

  const definitions = await Promise.all(
    unknownAddresses.map((address) =>
      vehicleRepo.findEcuDefinitionByAddress(manufacturer, model, address),
    ),
  )

  const byAddress = new Map<string, EcuDefinition>()
  definitions.forEach((definition, index) => {
    if (definition) byAddress.set(unknownAddresses[index], definition)
  })

  return (responseAddr) => byAddress.get(responseAddr)
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
    'Read an OBD-II PID value. Mode 01, 22 for manufacturer-specific.',
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
