import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { createPidFormulaCatalog } from './pidFormulaCatalog.js'
import type { PidFormulaCatalog } from '@/application/ports/PidFormulaCatalog.js'
import { toFormulaEntries } from '@/application/shared/formulaEntries.js'
import { ALL_SEED_PIDS } from '../persistence/sqlite/seed-pids.js'
import { dtcDescribe } from '@/domain/dtcCatalog.js'

import { Elm327ConnectionError, Elm327NoDataError, Elm327ParseError } from './errors.js'
import {
  formatCommand,
  parseModeResponse,
  parseMode22Response,
  parseVinResponse,
  parseDtcResponse,
  parseSupportedPidBitmask,
} from './protocol.js'
import { createElm327TcpClient } from './tcpTransport.js'
import type { Elm327TcpConfig } from './tcpTransport.js'

/** Re-export de compatibilidad — errores ELM327 desde {@link ./errors.ts}. */
export { Elm327ConnectionError, Elm327NoDataError, Elm327ParseError }
/** Re-export de compatibilidad — config TCP desde {@link ./tcpTransport.ts}. */
export type { Elm327TcpConfig } from './tcpTransport.js'

const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'

/** PIDs Mode 02 que se leen para construir el freeze frame. */
const FREEZE_FRAME_PIDS = ['04', '05', '0C', '0D', '11']

/** Modo 22 (UDS ReadDataByIdentifier): su respuesta se parsea distinto a la de los modos SAE. */
const MODE_UDS = '22'

/**
 * Adaptador OBD-II sobre TCP a dispositivo ELM327 (Docker, puerto 35000).
 *
 * Abre una única conexión TCP persistente en el constructor (con cola FIFO y
 * auto-reconexión con backoff) y la reutiliza para todas las lecturas. Esto
 * evita la saturación del dispositivo que causaban los sockets efímeros (6
 * comandos por diagnóstico, cada uno abriendo y cerrando su propio socket).
 *
 * El constructor dispara `connect()` sin esperar: si falla, la auto-reconexión
 * del transporte restaura el socket en la primera petición.
 */
export class Elm327TcpRepository implements ObdRepository {
  private readonly client: ReturnType<typeof createElm327TcpClient>
  private readonly pidFormulas: PidFormulaCatalog

  constructor(config: Elm327TcpConfig) {
    this.client = createElm327TcpClient(config)
    this.pidFormulas = createPidFormulaCatalog(toFormulaEntries(ALL_SEED_PIDS))
    this.client.connect().catch((err: unknown) => {
      console.error('[Elm327TcpRepository] eager connect failed:', err)
    })
  }

  /** Shutdown graceful de la conexión TCP al detenerse la aplicación. */
  async close(): Promise<void> {
    await this.client.close()
  }

  /** Envia el PID y extrae sus bytes de datos, sin resolver ninguna formula. */
  private async fetchPidBytes(mode: string, pid: string, dataBytes: number): Promise<number[]> {
    const raw = await this.client.sendCommand(formatCommand(mode, pid))
    return mode === MODE_UDS ? parseMode22Response(raw, dataBytes) : parseModeResponse(raw)
  }

  async readPid(mode: string, pid: string): Promise<number> {
    const entry = this.pidFormulas.get(mode, pid)
    const bytes = await this.fetchPidBytes(mode, pid, entry?.dataBytes ?? 0)
    return this.pidFormulas.apply(mode, pid, bytes)
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
      dtcCode: dtc ?? UNKNOWN_FREEZE_FRAME_DTC,
      pidValues,
    })
  }

  /** Envia un comando de lectura DTC y parsea la respuesta con el header del modo indicado. */
  private async fetchDtcCodes(mode: '03' | '07' | '0A'): Promise<DtcCode[]> {
    const raw = await this.client.sendCommand(mode)
    try {
      return parseDtcResponse(raw, mode).map(([b1, b2]) => {
        const code = DtcCode.decodeFromBytes(b1, b2)
        return new DtcCode({ code, description: dtcDescribe(code) })
      })
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

  async clearDtcCodes(): Promise<void> {
    await this.client.sendCommand('04')
  }

  async readVin(): Promise<string> {
    const raw = await this.client.sendCommand('09 02')
    return Vin.fromBytes(parseVinResponse(raw)).value
  }

  async getVehicleInfo(): Promise<VehicleInfo> {
    try {
      const vinValue = await this.readVin()
      const vin = new Vin(vinValue)
      return {
        make: vin.manufacturer ?? 'unknown',
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

  async getEcuInfo(): Promise<EcuInfo[]> {
    return [
      new EcuInfo({
        id: 0,
        vehicleId: 0,
        name: 'Engine Control Unit',
        requestAddr: '7E0',
        responseAddr: '7E8',
        type: 'ECM',
        protocol: 'ISO 15765-4 (CAN 11/500)',
      }),
    ]
  }
}
