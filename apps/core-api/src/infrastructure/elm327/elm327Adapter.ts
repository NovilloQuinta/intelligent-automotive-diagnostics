import type { ObdRepository, PidReadResult } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { createPidFormulaCatalog } from './pidFormulaCatalog.js'
import type { PidFormulaCatalog } from '@/application/ports/PidFormulaCatalog.js'
import { toFormulaEntries } from '@/application/shared/formulaEntries.js'
import { ALL_SEED_PIDS } from '@/domain/pidCatalog.js'
import { dtcDescribe } from '@/domain/dtcCatalog.js'
import { assertReadOnlyObdMode, UnsafeObdModeError } from '@/domain/obdServiceMode.js'

import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'
import {
  Elm327BusError,
  Elm327ConnectionError,
  Elm327NoDataError,
  Elm327ParseError,
} from './errors.js'
import {
  formatCommand,
  parseModeResponse,
  parseMode22Response,
  parseVinResponse,
  parseDtcResponse,
  parseSupportedPidBitmask,
} from './protocol.js'
import { discoverEcus } from './ecuDiscovery.js'

/** Re-export de compatibilidad — errores ELM327 desde {@link ./errors.ts}. */
export { Elm327BusError, Elm327ConnectionError, Elm327NoDataError, Elm327ParseError }
/** Re-export de compatibilidad — config TCP desde {@link ./tcpTransport.ts}. */
export type { Elm327TcpConfig } from './tcpTransport.js'

const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'

/** PIDs Mode 02 que se leen para construir el freeze frame. */
const FREEZE_FRAME_PIDS = ['04', '05', '0C', '0D', '11']

/** Modo 22 (UDS ReadDataByIdentifier): su respuesta se parsea distinto a la de los modos SAE. */
const MODE_UDS = '22'

/** Modo 04 (ClearDiagnosticInformation): unica escritura que el adaptador puede emitir. */
const MODE_CLEAR_DTC = '04'

/** Politica de seguridad del adaptador frente al vehiculo. */
export interface Elm327RepositoryOptions {
  /**
   * Bloquea tambien el borrado de DTC (Mode 04), la unica escritura del adaptador.
   *
   * Los modos de control (`2F`, `31`, `11`...) estan siempre bloqueados, con
   * independencia de esta opcion. Por defecto `false`, que preserva el borrado
   * de averias desde la UI.
   */
  readonly readOnly?: boolean
}

/**
 * Adaptador OBD-II sobre transporte ELM327 (TCP, Serial o Bluetooth).
 *
 * Recibe un {@link Elm327Transport} ya construido desde la capa de composición
 * y lo reutiliza para todas las lecturas. El adaptador solo consume el
 * transporte; no lo construye ni conoce el medio físico.
 *
 * El constructor dispara `connect()` sin esperar: si falla, la auto-reconexión
 * del transporte restaura la conexión en la primera petición.
 */
export class Elm327TcpRepository implements ObdRepository {
  private readonly client: Elm327Transport
  private readonly pidFormulas: PidFormulaCatalog
  private readonly vehicleRepo?: VehicleRepository
  private readonly readOnly: boolean

  constructor(
    transport: Elm327Transport,
    vehicleRepo?: VehicleRepository,
    logger?: LoggerPort,
    options?: Elm327RepositoryOptions,
  ) {
    this.client = transport
    this.vehicleRepo = vehicleRepo
    this.readOnly = options?.readOnly ?? false
    this.pidFormulas = createPidFormulaCatalog(toFormulaEntries(ALL_SEED_PIDS))
    this.client.connect().catch((err: unknown) => {
      const message = '[Elm327TcpRepository] eager connect failed'
      if (logger) {
        logger.error(message, { err: String(err) })
      } else {
        console.error(message + ':', err)
      }
    })
  }

  /** Shutdown graceful de la conexión TCP al detenerse la aplicación. */
  async close(): Promise<void> {
    await this.client.close()
  }

  /**
   * Envia el PID y extrae sus bytes de datos, sin resolver ninguna formula.
   *
   * Unico punto por el que salen al bus los comandos con modo elegido por el
   * llamante (LLM o cliente HTTP), y por tanto donde se aplica la allowlist de
   * {@link assertReadOnlyObdMode}: el comando se descarta antes de tocar el socket.
   *
   * @throws {UnsafeObdModeError} Si el modo no es de solo lectura.
   */
  private async fetchPidBytes(mode: string, pid: string, dataBytes: number): Promise<number[]> {
    assertReadOnlyObdMode(mode)
    const raw = await this.client.sendCommand(formatCommand(mode, pid))
    return mode === MODE_UDS ? parseMode22Response(raw, dataBytes) : parseModeResponse(raw)
  }

  async readPid(mode: string, pid: string): Promise<number> {
    return (await this.readPidWithBytes(mode, pid)).value
  }

  async readPidWithBytes(mode: string, pid: string): Promise<PidReadResult> {
    // Normaliza a mayúsculas para ser coherente con `pidKey` del catálogo estándar
    // (case-insensitive) y con los PidCodes almacenados en BD (uppercase).
    const modeUpper = mode.toUpperCase()
    const pidUpper = pid.toUpperCase()
    const entry = this.pidFormulas.get(modeUpper, pidUpper)

    // Cerrar el loop de lectura: los PIDs Mode 22 (o cualquier PID fuera del
    // catálogo estándar) se resuelven desde la BD vía el puerto VehicleRepository.
    if (this.vehicleRepo && (modeUpper === MODE_UDS || !entry)) {
      const definition = await this.vehicleRepo.findPidDefinition(modeUpper, pidUpper)
      if (definition) {
        const bytes = await this.fetchPidBytes(modeUpper, pidUpper, definition.dataBytes)
        return { value: definition.formula.evaluate(bytes), bytes }
      }
    }

    const bytes = await this.fetchPidBytes(modeUpper, pidUpper, entry?.dataBytes ?? 0)
    return { value: this.pidFormulas.apply(modeUpper, pidUpper, bytes), bytes }
  }

  async readPids(mode: string, pids: readonly string[]): Promise<Map<string, number>> {
    // Lectura secuencial (un comando por PID), no multi-PID en un solo comando:
    // el ELM327-emulator (y muchos adaptadores) no soporta "01 0C 05 0D 0F" y
    // responde "NO DATA". Se delega en readPid, que ya normaliza el caso y
    // aplica la fórmula del catálogo.
    const result = new Map<string, number>()
    for (const pid of pids) {
      try {
        result.set(pid, await this.readPid(mode, pid))
      } catch {
        // Degradación por PID: un PID no soportado (NO DATA) o sin fórmula
        // no invalida el resto del Map.
      }
    }
    return result
  }

  async readPidRaw(mode: string, pid: string, dataBytes: number): Promise<number[]> {
    const bytes = await this.fetchPidBytes(mode, pid, dataBytes)
    return dataBytes > 0 ? bytes.slice(0, dataBytes) : bytes
  }

  async getSupportedPids(): Promise<string[]> {
    const raw = await this.client.sendCommand('01 00')
    const bytes = parseModeResponse(raw)
    return parseSupportedPidBitmask(bytes)
  }

  /**
   * Lee el freeze frame con degradacion por PID: un {@code NO DATA} en un PID
   * no invalida el resto. Solo devuelve {@code null} si ningun PID responde.
   */
  async getFreezeFrame(dtc?: string): Promise<FreezeFrame | null> {
    const pidValues: Record<string, number> = {}
    for (const pid of FREEZE_FRAME_PIDS) {
      try {
        const bytes = await this.fetchPidBytes('02', pid, 2)
        pidValues[pid] = this.pidFormulas.apply('01', pid, bytes)
      } catch (err) {
        if (err instanceof Elm327NoDataError || err instanceof Elm327ParseError) continue
        if (err instanceof Error && /7F\s/i.test(err.message)) continue
        throw err
      }
    }
    if (Object.keys(pidValues).length === 0) return null
    return new FreezeFrame({
      dtcCode: dtc && dtc.trim() !== '' ? dtc : UNKNOWN_FREEZE_FRAME_DTC,
      pidValues,
    })
  }

  /** Resuelve la descripcion de un DTC: catalogo estandar J2012, o BD si es manufacturer-specific.
   * Nunca inventa: si ninguno de los dos la conoce devuelve {@code ''}.
   */
  private async resolveDtcDescription(code: string): Promise<string> {
    const normalized = code.toUpperCase()
    const known = dtcDescribe(normalized)
    if (known !== '' || !this.vehicleRepo) return known
    const definition = await this.vehicleRepo.findDtcDefinitionByCode(normalized)
    return definition?.description ?? ''
  }

  /**
   * Envia un comando de lectura DTC y parsea la respuesta con el header del modo indicado.
   *
   * El tipo ya restringe el modo a los tres de lectura, pero eso solo existe en
   * compilacion: la allowlist lo vuelve a comprobar en ejecucion para que el
   * comando no dependa de que nadie haya hecho un cast por el camino.
   */
  private async fetchDtcCodes(mode: '03' | '07' | '0A'): Promise<DtcCode[]> {
    assertReadOnlyObdMode(mode)
    const raw = await this.client.sendCommand(mode)
    try {
      const codes = parseDtcResponse(raw, mode).map(([b1, b2]) => DtcCode.decodeFromBytes(b1, b2))
      return await Promise.all(
        codes.map(
          async (code) =>
            new DtcCode({ code, description: await this.resolveDtcDescription(code) }),
        ),
      )
    } catch (err) {
      if (err instanceof Elm327ParseError) return []
      throw err
    }
  }

  async readDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes('03')
  }

  async readPendingDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes('07')
  }

  async readPermanentDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes('0A')
  }

  /**
   * Borra los DTC almacenados (Mode 04). Es la unica escritura del adaptador y es
   * irreversible en un vehiculo real: elimina codigos y freeze frames y reinicia
   * los monitores de emisiones.
   *
   * @throws {UnsafeObdModeError} Si el adaptador se construyo con `readOnly: true`.
   */
  async clearDtcCodes(): Promise<void> {
    if (this.readOnly) {
      throw new UnsafeObdModeError(
        `OBD mode "${MODE_CLEAR_DTC}" (clear DTC) is blocked: this adapter is configured as read-only.`,
      )
    }
    await this.client.sendCommand(MODE_CLEAR_DTC)
  }

  async readVin(): Promise<string> {
    const raw = await this.client.sendCommand('09 02')
    return Vin.fromBytes(parseVinResponse(raw)).value
  }

  async getVehicleInfo(): Promise<VehicleInfo> {
    try {
      const vinValue = await this.readVin()
      const vin = new Vin(vinValue)
      // El adaptador solo sabe lo que dice el bus: el VIN y lo que la ISO 3779
      // deriva de su posicion. Traducir el WMI a una marca es una consulta al
      // catalogo, y este es el borde del sistema — no tiene acceso a BBDD ni
      // debe tenerlo. Lo completa `ResolveVehicleIdentityUseCase` en aplicacion.
      return {
        make: 'unknown',
        model: 'unknown',
        year: vin.modelYear ?? 0,
        engineType: 'unknown',
        vin,
        vinStatus: 'read' as const,
      }
    } catch (err) {
      // VIN ilegible o no soportado: el diagnostico sigue siendo funcional
      return {
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin(FALLBACK_VIN),
        vinStatus:
          err instanceof Elm327NoDataError ? ('unsupported' as const) : ('unreadable' as const),
      }
    }
  }

  async getVehicleStatus(): Promise<VehicleStatus> {
    const raw = await this.client.sendCommand('01 01')
    const bytes = parseModeResponse(raw)
    return VehicleStatus.parse(bytes)
  }

  async setPower(_on: boolean): Promise<void> {
    // No-op: el adaptador no controla la alimentación del hardware
  }

  /**
   * Descubre las ECUs del bus CAN delegando en {@link discoverEcus}: el adapter
   * solo reutiliza el transporte inyectado, sin lógica de scan propia.
   */
  async getEcuInfo(): Promise<EcuInfo[]> {
    return discoverEcus(this.client)
  }
}
