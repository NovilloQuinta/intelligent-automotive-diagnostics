import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import { DtcCode } from '@/domain/value-objects/dtcCode.js'
import { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import { Vin, FALLBACK_VIN } from '@/domain/value-objects/vin.js'
import { createPidFormulaCatalog } from './pidFormulaCatalog.js'
import type { PidFormulaCatalog } from '@/application/ports/PidFormulaCatalog.js'
import { toFormulaEntries } from '@/application/shared/formulaEntries.js'
import { ALL_SEED_PIDS } from '../persistence/sqlite/seed-pids.js'

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

/** Errores del adaptador ELM327 — re-exportados desde {@link ./errors.ts}. */
export { Elm327ConnectionError, Elm327NoDataError, Elm327ParseError }

/** Configuración del adaptador TCP — re-exportada desde {@link ./tcpTransport.ts}. */
export type { Elm327TcpConfig } from './tcpTransport.js'

/** Código DTC de placeholder cuando la respuesta ELM327 no identifica el DTC que disparó el freeze frame. */
const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'

/**
 * Adaptador OBD-II sobre TCP a dispositivo ELM327 (Docker, puerto 35000).
 * Conexión persistente: `createElm327TcpClient` abre un único socket TCP de forma
 * eager en el constructor (con cola FIFO y auto-reconexión con backoff), parseo
 * ELM327 sin headers (AT H0 por defecto), aplicación de fórmulas SAE J1979 +
 * VAG Mode 22, decodificación DTC SAE J2012. `close()` permite un shutdown
 * graceful de la conexión al detenerse la aplicación.
 */
export class Elm327TcpRepository implements ObdRepository {
  private readonly client: ReturnType<typeof createElm327TcpClient>
  private readonly pidFormulas: PidFormulaCatalog

  constructor(config: Elm327TcpConfig) {
    this.client = createElm327TcpClient(config)
    this.pidFormulas = createPidFormulaCatalog(toFormulaEntries(ALL_SEED_PIDS))
    // Conexión eager: el ciclo de vida del adapter es "nace al arrancar la app,
    // muere al detenerse". El constructor no puede ser async, así que connect()
    // se dispara sin esperar; si falla solo se loguea y NO se tira: la
    // auto-reconexión del transporte restaura el socket para la primera petición.
    this.client.connect().catch((err: unknown) => {
      console.error('[Elm327TcpRepository] eager connect failed:', err)
    })
  }

  /** Cierra la conexión TCP persistente de forma graceful (shutdown de la app). */
  async close(): Promise<void> {
    await this.client.close()
  }

  /** Lee un PID OBD-II del dispositivo ELM327 y devuelve su valor físico. */
  async readPid(mode: string, pid: string): Promise<number> {
    const raw = await this.client.sendCommand(formatCommand(mode, pid))
    const entry = this.pidFormulas.get(mode, pid)
    const bytes =
      mode === '22' ? parseMode22Response(raw, entry?.dataBytes ?? 0) : parseModeResponse(raw)
    return this.pidFormulas.apply(mode, pid, bytes)
  }

  /** Consulta los PIDs soportados por la ECU via comando 01 00. */
  async getSupportedPids(): Promise<string[]> {
    const raw = await this.client.sendCommand('01 00')
    const bytes = parseModeResponse(raw)
    return parseSupportedPidBitmask(bytes)
  }

  /** Devuelve el freeze frame del DTC indicado via comando 02 0C. */
  async getFreezeFrame(dtc?: string): Promise<FreezeFrame | null> {
    const raw = await this.client.sendCommand('02 0C')
    if (/NO DATA/i.test(raw)) return null
    const bytes = parseModeResponse(raw)
    return new FreezeFrame({
      dtcCode: dtc ?? UNKNOWN_FREEZE_FRAME_DTC,
      pidValues: { '0C': this.pidFormulas.apply('01', '0C', bytes) },
    })
  }

  /** Lee los codigos DTC almacenados en la ECU via comando 03. */
  async readDtcCodes(): Promise<DtcCode[]> {
    const raw = await this.client.sendCommand('03')
    return parseDtcResponse(raw).map(
      ([b1, b2]) => new DtcCode({ code: DtcCode.decodeFromBytes(b1, b2) }),
    )
  }

  /** Limpia los codigos DTC de la ECU via comando 04. */
  async clearDtcCodes(): Promise<void> {
    await this.client.sendCommand('04')
  }

  /** Lee el VIN del vehiculo via comando 09 02. */
  async readVin(): Promise<string> {
    const raw = await this.client.sendCommand('09 02')
    return Vin.fromBytes(parseVinResponse(raw)).value
  }

  /** Obtiene la informacion del vehiculo conectado al dispositivo ELM327. */
  async getVehicleInfo(): Promise<VehicleInfo> {
    try {
      const vin = new Vin(await this.readVin())
      return {
        make: vin.manufacturer ?? 'unknown',
        model: 'unknown',
        year: vin.modelYear ?? 0,
        engineType: 'unknown',
        vin,
      }
    } catch {
      // VIN ilegible: identificacion desconocida pero diagnóstico funcional
      return {
        make: 'unknown',
        model: 'unknown',
        year: 0,
        engineType: 'unknown',
        vin: new Vin(FALLBACK_VIN),
      }
    }
  }

  /** Controla el estado de alimentacion del dispositivo ELM327. */
  async setPower(_on: boolean): Promise<void> {
    // No-op: el adaptador no controla la alimentación del hardware
  }
}
