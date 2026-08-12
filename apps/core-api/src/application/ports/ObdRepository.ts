import type { DtcCode } from '@/domain/value-objects/dtcCode.js'
import type { EcuInfo } from '@/domain/entities/ecuInfo.js'
import type { FreezeFrame } from '@/domain/value-objects/freezeFrame.js'
import type { VehicleInfo } from '@/domain/value-objects/vehicleInfo.js'
import type { VehicleStatus } from '@/domain/value-objects/vehicleStatus.js'

/** Contrato para la adquisición de datos OBD-II desde el hardware. */
export interface ObdRepository {
  /** Service 01 — Lee un PID OBD-II genérico por modo y código.
   * @param mode — Modo OBD (01, 02, 09, 22, ...)
   * @param pid — Código del PID (0C, 05, 0300, ...)
   * @returns Valor físico del PID (tras aplicar la fórmula)
   */
  readPid(mode: string, pid: string): Promise<number>

  /**
   * Service 01 — Lee varios PIDs en un único comando multi-PID.
   *
   * Envía un solo comando (ej. `01 0C 0D 05`) y devuelve un Map PID → valor físico.
   * Degradación por PID: un PID que responde `NO DATA` se omite del Map; el resto
   * mantiene sus valores.
   *
   * @param mode — Modo OBD (ej. `'01'`)
   * @param pids — Códigos de PID a leer (ej. `['0C', '0D', '05']`)
   * @returns Map con clave = código de PID (uppercase) y valor = valor físico
   */
  readPids(mode: string, pids: readonly string[]): Promise<Map<string, number>>

  /** Lee un PID devolviendo sus bytes de datos **sin aplicar ninguna formula**.
   *
   * Existe para validar un PID recien descubierto, cuya formula no esta en el catalogo interno
   * del adaptador: la formula la aplica el llamador con el VO `Formula` del PID descubierto.
   *
   * @param mode — Modo OBD (01, 22, ...)
   * @param pid — Código del PID (0C, F40C, ...)
   * @param dataBytes — Nº de bytes de datos esperados en la respuesta
   * @returns Bytes de datos crudos de la respuesta
   * @throws {PidRawReadNotSupportedError} Si el adaptador no puede entregar bytes crudos de ese PID
   */
  readPidRaw(mode: string, pid: string, dataBytes: number): Promise<number[]>

  /** Service 01 PID 00/20/40/60 — Devuelve los PIDs soportados como bitmask. */
  getSupportedPids(): Promise<string[]>

  /** Service 02 — Datos congelados del momento en que se disparó un DTC.
   * @param dtc — Código DTC opcional. Si no se especifica, devuelve el último.
   * @returns FreezeFrame o null si no hay snapshot disponible
   */
  getFreezeFrame(dtc?: string): Promise<FreezeFrame | null>

  /** Service 03 — Lee códigos de fallo activos. */
  readDtcCodes(): Promise<DtcCode[]>

  /** Service 04 — Borra los DTCs y valores almacenados. */
  clearDtcCodes(): Promise<void>

  /** Service 07 — Lee códigos de fallo pendientes (no confirmados). */
  readPendingDtcCodes(): Promise<DtcCode[]>

  /** Service 0A — Lee códigos de fallo permanentes (no borrables con Mode 04). */
  readPermanentDtcCodes(): Promise<DtcCode[]>

  /** Service 09 PID 02 — Lee el VIN del vehículo. */
  readVin(): Promise<string>

  /** Información estática del vehículo conectado (marca, modelo, año, tipo motor). */
  getVehicleInfo(): Promise<VehicleInfo>

  /** Devuelve las ECUs descubiertas en el bus CAN/OBD del vehiculo conectado. */
  getEcuInfo(): Promise<EcuInfo[]>

  /** Service 01 PID 01 — Estado del testigo MIL y monitores de emisiones. */
  getVehicleStatus(): Promise<VehicleStatus>

  /** Activa/desactiva la alimentación del adaptador OBD. */
  setPower(on: boolean): Promise<void>
}
