import type { ObdRepository, PidReadResult } from '@/application/ports/ObdRepository.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { DtcCode } from '@/domain/value-objects/DtcCode.js'
import type { EcuInfo } from '@/domain/entities/EcuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/FreezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/VehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/VehicleStatus.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/Vin.js'
import { createPidFormulaCatalog } from './pidFormulaCatalog.js'
import type { PidFormulaCatalogPort } from '@/application/ports/PidFormulaCatalogPort.js'
import type { PidFormulaEntry } from '@/domain/pidFormulaEntry.js'
import { toFormulaEntries } from '@/application/shared/formulaEntries.js'
import { ALL_SEED_PIDS } from '@/domain/catalogs/pidCatalog.js'
import { dtcDescribe } from '@/domain/catalogs/dtcCatalog.js'
import { assertReadOnlyObdMode, UnsafeObdModeError } from '@/domain/obdServiceMode.js'

import type { Elm327TransportPort } from '@/application/ports/Elm327TransportPort.js'
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
  parseDtcResponseByEcu,
  parseSupportedPidBitmask,
  declaresNextPidRange,
  type DtcMode,
  type EcuDtcGroup,
} from './protocol.js'
import { discoverEcus } from './ecuDiscovery.js'

/** Re-export de compatibilidad — errores ELM327 definidos en `./errors.ts`. */
export { Elm327BusError, Elm327ConnectionError, Elm327NoDataError, Elm327ParseError }
/** Re-export de compatibilidad — config TCP definida en `./tcpTransport.ts`. */
export type { Elm327TcpConfig } from './tcpTransport.js'

const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'

/** PIDs Mode 02 que se leen para construir el freeze frame. */
const FREEZE_FRAME_PIDS = ['04', '05', '0C', '0D', '11']

/** Mode 02 PID 02: DTC que disparo el guardado del freeze frame. */
const FREEZE_FRAME_DTC_PID = '02'

/** El dtc pedido no es el dueño real del snapshot (solo se puede saber si se conoce el dueño). */
function freezeFrameMismatches(owningDtc: string | null, dtc: string | undefined): boolean {
  if (!owningDtc || !dtc) return false
  return dtc.trim() !== '' && owningDtc !== dtc
}

/** Prioriza el dueño real; sin el, cae al dtc pedido o a UNKNOWN. */
function resolveFreezeFrameDtc(owningDtc: string | null, dtc: string | undefined): string {
  if (owningDtc) return owningDtc
  return dtc?.trim() ? dtc : UNKNOWN_FREEZE_FRAME_DTC
}

/** Bytes de dato del PID segun el catalogo estandar; 0 si no esta catalogado. */
function pidDataBytes(entry: PidFormulaEntry | undefined): number {
  return entry?.dataBytes ?? 0
}

/** NO DATA, parse error o respuesta negativa: el PID no responde, no es un fallo real del bus. */
function isRecoverableReadError(err: unknown): boolean {
  if (err instanceof Elm327NoDataError || err instanceof Elm327ParseError) return true
  return err instanceof Error && NEGATIVE_RESPONSE_RE.test(err.message)
}

/** Modo 22 (UDS ReadDataByIdentifier): su respuesta se parsea distinto a la de los modos SAE. */
const MODE_UDS = '22'

/** Modo 01 (mostrar datos actuales): bitmask de PIDs soportados y formulas de decodificacion. */
const MODE_SAE_01 = '01'
/** Modo 02 (freeze frame): mismos PIDs y formulas que el modo 01, congelados al disparar un DTC. */
const MODE_FREEZE_FRAME = '02'

/** Modo 03 (mostrar DTC almacenados). */
const MODE_DTC_STORED = '03'
/** Modo 07 (mostrar DTC pendientes). */
const MODE_DTC_PENDING = '07'
/** Modo 0A (mostrar DTC permanentes). */
const MODE_DTC_PERMANENT = '0A'

/** Modo 09 PID 02 (Service 09, VIN). */
const MODE_VIN = '09 02'
/** Modo 01 PID 01 (Service 01, estado del monitor de emisiones). */
const MODE_VEHICLE_STATUS = '01 01'

/** Activa las cabeceras CAN, para saber que ECU responde. */
const HEADERS_ON = 'AT H1'

/** Vuelve a apagarlas: es el estado sobre el que operan las lecturas normales. */
const HEADERS_OFF = 'AT H0'

/** Modo 04 (ClearDiagnosticInformation): unica escritura que el adaptador puede emitir. */
const MODE_CLEAR_DTC = '04'

/**
 * Los cuatro bitmask de PIDs soportados de SAE J1979, por el PID desde el que numeran.
 * `01 60` es el ultimo que el estandar define como inventario.
 */
const SUPPORTED_PID_RANGES = [0x00, 0x20, 0x40, 0x60] as const

/** Motivo por defecto del rechazo, cuando la composicion no aporta uno mas concreto. */
const DEFAULT_READ_ONLY_REASON = 'this adapter is configured as read-only'

/** Byte de respuesta negativa (0x7F) en el mensaje de error: el PID existe pero el ECU lo rechaza. */
const NEGATIVE_RESPONSE_RE = /7F\s/i

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

  /**
   * Por que esta en solo lectura, en el mensaje del rechazo.
   *
   * Sin esto, quien pulsa "Borrar averias" y recibe un error no puede distinguir
   * una proteccion deliberada de un fallo del adaptador, que es justo la duda que
   * lleva a desactivar la proteccion "por probar".
   */
  readonly readOnlyReason?: string
}

/**
 * Adaptador OBD-II sobre transporte ELM327 (TCP, Serial o Bluetooth).
 *
 * Recibe un {@link Elm327TransportPort} ya construido desde la capa de composición
 * y lo reutiliza para todas las lecturas. El adaptador solo consume el
 * transporte; no lo construye ni conoce el medio físico.
 *
 * El constructor dispara `connect()` sin esperar: si falla, la auto-reconexión
 * del transporte restaura la conexión en la primera petición.
 */
export class Elm327TcpRepository implements ObdRepository {
  private readonly client: Elm327TransportPort
  private readonly pidFormulas: PidFormulaCatalogPort
  private readonly vehicleRepo?: VehicleRepository
  private readonly readOnly: boolean
  private readonly readOnlyReason: string

  constructor(
    transport: Elm327TransportPort,
    vehicleRepo?: VehicleRepository,
    logger?: LoggerPort,
    options?: Elm327RepositoryOptions,
  ) {
    this.client = transport
    this.vehicleRepo = vehicleRepo
    this.readOnly = options?.readOnly ?? false
    this.readOnlyReason = options?.readOnlyReason ?? DEFAULT_READ_ONLY_REASON
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

  /** Mode 22 (o cualquier PID fuera del catalogo estandar) se resuelve desde la BD. */
  private usesVehicleRepoPid(modeUpper: string, entry: PidFormulaEntry | undefined): boolean {
    if (!this.vehicleRepo) return false
    return modeUpper === MODE_UDS || !entry
  }

  async readPidWithBytes(mode: string, pid: string): Promise<PidReadResult> {
    // Normaliza a mayúsculas para ser coherente con `pidKey` del catálogo estándar
    // (case-insensitive) y con los PidCodes almacenados en BD (uppercase).
    const modeUpper = mode.toUpperCase()
    const pidUpper = pid.toUpperCase()
    const entry = this.pidFormulas.get(modeUpper, pidUpper)

    if (this.usesVehicleRepoPid(modeUpper, entry)) {
      const definition = await this.vehicleRepo?.findPidDefinition(modeUpper, pidUpper)
      if (definition) {
        const bytes = await this.fetchPidBytes(modeUpper, pidUpper, definition.dataBytes)
        return { value: definition.formula.evaluate(bytes), bytes }
      }
    }

    const bytes = await this.fetchPidBytes(modeUpper, pidUpper, pidDataBytes(entry))
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

  /**
   * PIDs Mode 01 que el vehiculo declara soportar.
   *
   * SAE J1979 reparte el inventario en bitmask encadenados: `01 00` describe los PIDs
   * 01-20 y su ultimo bit dice si existe `01 20`, que describe 21-40, y asi hasta `01 60`.
   * Antes solo se leia el primero, asi que cinco PIDs que el catalogo **si** sabe
   * decodificar —nivel de combustible, distancia desde el borrado, voltaje del modulo,
   * temperatura ambiente y del aceite— no se podian descubrir nunca. Quien lo nota es el
   * diagnostico cognitivo: `get_available_pids` le pasa esta lista al agente, que razonaba
   * con un inventario recortado delante de un coche real.
   *
   * Se **pregunta**, no se impone: cada rango se pide solo si el bitmask anterior lo
   * declara, en la linea del ADR 009. Y se corta ante un rango sin respuesta —los
   * escenarios del emulador declaran `01 60` sin implementarlo—, conservando lo ya
   * descubierto en vez de tumbar el descubrimiento entero.
   */
  async getSupportedPids(): Promise<string[]> {
    const pids: string[] = []

    for (const range of SUPPORTED_PID_RANGES) {
      const bytes = await this.readPidRangeBitmask(range)
      if (bytes === null) break
      pids.push(...parseSupportedPidBitmask(bytes, range))
      if (!declaresNextPidRange(bytes)) break
    }

    return pids
  }

  /** Bitmask de un rango, o `null` si el vehiculo no contesta a ese `01 XX`. */
  private async readPidRangeBitmask(range: number): Promise<number[] | null> {
    const pid = range.toString(16).padStart(2, '0').toUpperCase()
    try {
      return parseModeResponse(await this.client.sendCommand(`${MODE_SAE_01} ${pid}`))
    } catch (err) {
      // Un rango que no responde cierra la cadena; los anteriores siguen valiendo.
      if (err instanceof Elm327NoDataError || err instanceof Elm327ParseError) return null
      throw err
    }
  }

  /** Como {@link fetchPidBytes}, pero un NO DATA/parse/negativo vuelve `null` en vez de lanzar. */
  private async tryFetchPidBytes(
    mode: string,
    pid: string,
    dataBytes: number,
  ): Promise<number[] | null> {
    try {
      return await this.fetchPidBytes(mode, pid, dataBytes)
    } catch (err) {
      if (isRecoverableReadError(err)) return null
      throw err
    }
  }

  /**
   * Lee el freeze frame con degradacion por PID: un {@code NO DATA} en un PID
   * no invalida el resto. Solo devuelve {@code null} si ningun PID responde.
   *
   * Un vehiculo real solo guarda UN freeze frame, ligado al primer DTC que lo
   * disparo (Mode 02 PID 02 dice cual). Si se pide uno distinto al que de verdad
   * lo disparo, no hay snapshot que darle: se devuelve {@code null} en vez de
   * relabelar el mismo dato bajo otro codigo, que antes hacia que el freeze
   * frame pareciera identico sin importar en que DTC se hiciera clic.
   */
  async getFreezeFrame(dtc?: string): Promise<FreezeFrame | null> {
    const owningDtc = await this.readFreezeFrameOwningDtc()
    if (freezeFrameMismatches(owningDtc, dtc)) return null

    const pidValues: Record<string, number> = {}
    for (const pid of FREEZE_FRAME_PIDS) {
      const bytes = await this.tryFetchPidBytes(MODE_FREEZE_FRAME, pid, 2)
      if (bytes) pidValues[pid] = this.pidFormulas.apply(MODE_SAE_01, pid, bytes)
    }
    if (Object.keys(pidValues).length === 0) return null
    return new FreezeFrame({ dtcCode: resolveFreezeFrameDtc(owningDtc, dtc), pidValues })
  }

  /**
   * Lee el DTC dueño del freeze frame (Mode 02 PID 02). `null` si el adaptador no lo
   * soporta: sin ese dato no se puede verificar la propiedad, asi que se sigue
   * devolviendo el snapshot best-effort en vez de bloquear la lectura entera.
   */
  private async readFreezeFrameOwningDtc(): Promise<string | null> {
    const bytes = await this.tryFetchPidBytes(MODE_FREEZE_FRAME, FREEZE_FRAME_DTC_PID, 2)
    return bytes ? DtcCode.decodeFromBytes(bytes[0], bytes[1]) : null
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
  private async fetchDtcCodes(mode: DtcMode): Promise<DtcCode[]> {
    assertReadOnlyObdMode(mode)
    // Los headers se activan para saber que ECU reporta cada codigo, y se apagan en
    // el `finally` porque son estado global del adaptador: una lectura concurrente
    // que caiga entre medias volveria con el header delante y sin parsear. Mismo
    // patron que {@link discoverEcus}, incluida la reserva de la conexion.
    const raw = await this.client.runExclusive(async (session) => {
      try {
        await session.sendCommand(HEADERS_ON)
        return await session.sendCommand(mode)
      } finally {
        await session.sendCommand(HEADERS_OFF)
      }
    })
    try {
      return await this.toDtcCodes(parseDtcResponseByEcu(raw, mode))
    } catch (err) {
      if (err instanceof Elm327ParseError) return []
      throw err
    }
  }

  /** Decodifica los grupos del bus a `DtcCode`, conservando la ECU de origen. */
  private async toDtcCodes(groups: EcuDtcGroup[]): Promise<DtcCode[]> {
    const decoded = groups.flatMap((group) =>
      group.pairs.map(([b1, b2]) => ({
        code: DtcCode.decodeFromBytes(b1, b2),
        ecuAddress: group.ecuAddress,
      })),
    )
    return Promise.all(
      decoded.map(
        async ({ code, ecuAddress }) =>
          new DtcCode({ code, description: await this.resolveDtcDescription(code), ecuAddress }),
      ),
    )
  }

  async readDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes(MODE_DTC_STORED)
  }

  async readPendingDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes(MODE_DTC_PENDING)
  }

  async readPermanentDtcCodes(): Promise<DtcCode[]> {
    return this.fetchDtcCodes(MODE_DTC_PERMANENT)
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
        `OBD mode "${MODE_CLEAR_DTC}" (clear DTC) is blocked: ${this.readOnlyReason}.`,
      )
    }
    await this.client.sendCommand(MODE_CLEAR_DTC)
  }

  async readVin(): Promise<string> {
    const raw = await this.client.sendCommand(MODE_VIN)
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
    const raw = await this.client.sendCommand(MODE_VEHICLE_STATUS)
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
