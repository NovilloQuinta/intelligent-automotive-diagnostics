/**
 * Servicio OBD-II sobre el transporte USB nativo (Android/Capacitor).
 *
 * Composicion cliente de lo que en el backend hacen `Elm327TcpRepository`
 * (`apps/core-api/src/infrastructure/elm327/elm327Adapter.ts`) y sus casos de
 * uso (`ProcessVehicleDiagnosisUseCase`, `GetLiveDataUseCase`). Expone las
 * mismas formas de respuesta que `@/lib/api` para que los hooks del dashboard
 * (`useLiveTelemetry`, `useFreezeFrame`, `useEcuInfo`, `useDiagnosis`) no
 * necesiten saber si el dato vino del USB del telefono o del core-api por HTTP.
 *
 * Alcance deliberadamente menor que el backend: sin PIDs propietarios Mode 22
 * (necesitan la BD del servidor) y sin resolucion de fabricante por VIN (RAG/LLM,
 * sigue siendo responsabilidad del core-api). Telemetria, DTCs y freeze frame —
 * lo que este modo necesita funcionando sin red— estan completos.
 */
import type {
  DtcCode as DtcCodeDto,
  EcuInfo,
  FreezeFrame as FreezeFrameDto,
  VehicleStatusOutput,
} from '@/components/dashboard/types'
import type { DiagnosisResponse, Severity } from '@/components/dashboard/types'
import type { LiveDataResponse } from '@/lib/apiTypes'
import { DtcCode } from './dtcCode'
import { discoverEcus } from './ecuDiscovery'
import { Elm327NoDataError, Elm327ParseError } from './errors'
import { FreezeFrame } from './freezeFrame'
import { PID_CATALOG_BY_CODE, PID_METADATA, type PidCatalogEntry } from './pidCatalog'
import { bigEndian, evaluatePid } from './pidFormula'
import {
  declaresNextPidRange,
  formatCommand,
  parseDtcResponseByEcu,
  parseModeResponse,
  parseSupportedPidBitmask,
  parseVinResponse,
  type DtcMode,
  type EcuDtcGroup,
} from './protocol'
import { createNativeUsbTransport } from './reliableTransport'
import { assertReadOnlyObdMode } from './obdServiceMode'
import { dtcDescribe } from './dtcCatalog'
import type { Elm327TransportPort } from './transportPort'

const MODE_SAE_01 = '01'
const MODE_FREEZE_FRAME = '02'
const MODE_DTC_STORED: DtcMode = '03'
const MODE_DTC_PENDING: DtcMode = '07'
const MODE_DTC_PERMANENT: DtcMode = '0A'
const MODE_VIN = '09 02'
const MODE_VEHICLE_STATUS = '01 01'
const MODE_CLEAR_DTC = '04'
const HEADERS_ON = 'AT H1'
const HEADERS_OFF = 'AT H0'
const UNKNOWN_FREEZE_FRAME_DTC = 'UNKNOWN'
const FREEZE_FRAME_PIDS = ['04', '05', '0C', '0D', '11']
const FREEZE_FRAME_DTC_PID = '02'
const DEFAULT_LIVE_PIDS = ['0C', '05', '0D', '0F']
const NEGATIVE_RESPONSE_RE = /7F\s/i

function applyFormula(entry: PidCatalogEntry | undefined, bytes: number[]): number {
  if (!entry) return bigEndian(bytes)
  return evaluatePid(entry.formula, bytes.slice(0, entry.dataBytes))
}

function isRecoverableReadError(err: unknown): boolean {
  if (err instanceof Elm327NoDataError || err instanceof Elm327ParseError) return true
  return err instanceof Error && NEGATIVE_RESPONSE_RE.test(err.message)
}

function freezeFrameMismatches(owningDtc: string | null, dtc: string | undefined): boolean {
  if (!owningDtc || !dtc) return false
  return dtc.trim() !== '' && owningDtc !== dtc
}

function resolveFreezeFrameDtc(owningDtc: string | null, dtc: string | undefined): string {
  if (owningDtc) return owningDtc
  return dtc?.trim() ? dtc : UNKNOWN_FREEZE_FRAME_DTC
}

function computeSeverity(dtcCount: number, hasFreezeFrame: boolean): Severity {
  if (dtcCount === 0) return 'low'
  if (hasFreezeFrame) return 'critical'
  return 'high'
}

function buildDiagnosisText(
  dtcCodes: DtcCodeDto[],
  severity: Severity,
  freezeFrame: FreezeFrameDto | null,
): string {
  const description =
    dtcCodes.length > 0 ? dtcCodes.map((d) => d.code).join(', ') : 'No fault codes detected'
  const base = `[${severity.toUpperCase()}] ${description}`
  if (!freezeFrame) return base
  const freezeKeys = Object.keys(freezeFrame.pidValues)
    .map((pid) => PID_METADATA.get(pid)?.name ?? pid)
    .join(', ')
  return `${base} (freeze frame: ${freezeFrame.dtcCode} → ${freezeKeys})`
}

/**
 * Servicio OBD-II de una unica sesion USB. Se crea una vez (module-level
 * singleton en `@/lib/obdBridge`) y se reutiliza mientras la app este viva:
 * abrir el puerto USB de nuevo en cada lectura seria tan lento como reconectar
 * el TCP en cada peticion, que es justo lo que el transporte persistente evita
 * en el lado servidor.
 */
export class NativeObdService {
  private readonly transport: Elm327TransportPort

  constructor(transport: Elm327TransportPort = createNativeUsbTransport()) {
    this.transport = transport
    this.transport.connect().catch((err: unknown) => {
      console.error('[NativeObdService] eager connect failed:', err)
    })
  }

  async close(): Promise<void> {
    await this.transport.close()
  }

  private async fetchPidBytes(mode: string, pid: string): Promise<number[]> {
    assertReadOnlyObdMode(mode)
    const raw = await this.transport.sendCommand(formatCommand(mode, pid))
    return parseModeResponse(raw)
  }

  private async tryFetchPidBytes(mode: string, pid: string): Promise<number[] | null> {
    try {
      return await this.fetchPidBytes(mode, pid)
    } catch (err) {
      if (isRecoverableReadError(err)) return null
      throw err
    }
  }

  private async readPid(pid: string): Promise<number | null> {
    const entry = PID_CATALOG_BY_CODE.get(pid.toUpperCase())
    const bytes = await this.tryFetchPidBytes(MODE_SAE_01, pid)
    if (bytes === null) return null
    return applyFormula(entry, bytes)
  }

  /** Espejo de `GetLiveDataUseCase.execute`: PIDs por defecto o los pedidos, con degradacion por PID. */
  async getLiveData(pids?: readonly string[]): Promise<LiveDataResponse> {
    const requested = (pids && pids.length > 0 ? pids : DEFAULT_LIVE_PIDS).map((p) =>
      p.toUpperCase(),
    )
    const values = new Map<string, number | null>()
    for (const pid of requested) {
      values.set(pid, await this.readPid(pid))
    }
    const gaugeField: Record<string, keyof LiveDataResponse> = {
      '0C': 'rpm',
      '05': 'coolantTemp',
      '0D': 'speed',
      '0F': 'intakeTemp',
    }
    const result: LiveDataResponse = {
      rpm: null,
      coolantTemp: null,
      speed: null,
      intakeTemp: null,
      readings: [],
    }
    for (const pid of requested) {
      const value = values.get(pid) ?? null
      const field = gaugeField[pid]
      if (field) (result[field] as number | null) = value
      const metadata = PID_METADATA.get(pid)
      result.readings.push({
        code: `${MODE_SAE_01} ${pid}`,
        name: metadata?.name ?? pid,
        unit: metadata?.unit ?? '',
        value,
      })
    }
    return result
  }

  /** PIDs Mode 01 soportados por el vehiculo, recorriendo los 4 bitmask de SAE J1979. */
  async getSupportedPids(): Promise<string[]> {
    const pids: string[] = []
    for (const range of [0x00, 0x20, 0x40, 0x60]) {
      const pid = range.toString(16).padStart(2, '0').toUpperCase()
      const bytes = await this.tryFetchPidBytes(MODE_SAE_01, pid)
      if (bytes === null) break
      pids.push(...parseSupportedPidBitmask(bytes, range))
      if (!declaresNextPidRange(bytes)) break
    }
    return pids
  }

  private async readFreezeFrameOwningDtc(): Promise<string | null> {
    const bytes = await this.tryFetchPidBytes(MODE_FREEZE_FRAME, FREEZE_FRAME_DTC_PID)
    return bytes ? DtcCode.decodeFromBytes(bytes[0], bytes[1]) : null
  }

  /** Espejo de `Elm327TcpRepository.getFreezeFrame`: no relabela un snapshot bajo un DTC que no es el dueño. */
  async getFreezeFrame(dtc?: string): Promise<FreezeFrameDto | null> {
    const owningDtc = await this.readFreezeFrameOwningDtc()
    if (freezeFrameMismatches(owningDtc, dtc)) return null

    const pidValues: Record<string, number> = {}
    for (const pid of FREEZE_FRAME_PIDS) {
      const bytes = await this.tryFetchPidBytes(MODE_FREEZE_FRAME, pid)
      if (bytes) {
        const entry = PID_CATALOG_BY_CODE.get(pid)
        pidValues[pid] = applyFormula(entry, bytes)
      }
    }
    if (Object.keys(pidValues).length === 0) return null
    const frame = new FreezeFrame({ dtcCode: resolveFreezeFrameDtc(owningDtc, dtc), pidValues })
    return { dtcCode: frame.dtcCode, pidValues: frame.pidValues as Record<string, number> }
  }

  private resolveDtcDescription(code: string): string {
    return dtcDescribe(code.toUpperCase())
  }

  private toDtcCodes(groups: EcuDtcGroup[]): DtcCodeDto[] {
    return groups.flatMap((group) =>
      group.pairs.map(([b1, b2]) => {
        const code = DtcCode.decodeFromBytes(b1, b2)
        const dtc = new DtcCode({
          code,
          description: this.resolveDtcDescription(code),
          ecuAddress: group.ecuAddress,
        })
        return { code: dtc.code, description: dtc.description, ecuAddress: dtc.ecuAddress }
      }),
    )
  }

  private async fetchDtcCodes(mode: DtcMode): Promise<DtcCodeDto[]> {
    assertReadOnlyObdMode(mode)
    const raw = await this.transport.runExclusive(async (session) => {
      try {
        await session.sendCommand(HEADERS_ON)
        return await session.sendCommand(mode)
      } finally {
        await session.sendCommand(HEADERS_OFF)
      }
    })
    try {
      return this.toDtcCodes(parseDtcResponseByEcu(raw, mode))
    } catch (err) {
      if (err instanceof Elm327ParseError) return []
      throw err
    }
  }

  async readDtcCodes(): Promise<DtcCodeDto[]> {
    return this.fetchDtcCodes(MODE_DTC_STORED)
  }

  async readPendingDtcCodes(): Promise<DtcCodeDto[]> {
    return this.fetchDtcCodes(MODE_DTC_PENDING)
  }

  async readPermanentDtcCodes(): Promise<DtcCodeDto[]> {
    return this.fetchDtcCodes(MODE_DTC_PERMANENT)
  }

  async clearDtcCodes(): Promise<void> {
    await this.transport.sendCommand(MODE_CLEAR_DTC)
  }

  async readVin(): Promise<string> {
    const raw = await this.transport.sendCommand(MODE_VIN)
    const bytes = parseVinResponse(raw)
    return bytes.length > 0
      ? String.fromCharCode(...bytes)
          .replace(/\0/g, '')
          .trim()
      : ''
  }

  async getVehicleStatus(): Promise<VehicleStatusOutput> {
    const raw = await this.transport.sendCommand(MODE_VEHICLE_STATUS)
    const bytes = parseModeResponse(raw)
    const [byteA, byteB] = bytes
    return {
      milOn: (byteA & 0x80) !== 0,
      dtcCount: byteA & 0x7f,
      engineType: (byteB & 0x08) === 0 ? 'spark' : 'compression',
      monitors: [],
    }
  }

  async getEcuInfo(): Promise<EcuInfo[]> {
    return discoverEcus(this.transport)
  }

  /** Espejo de `DiagnosisService.diagnose` (sin LLM): 4 PIDs + DTCs + freeze frame. */
  async runDiagnosis(): Promise<DiagnosisResponse> {
    const rpm = (await this.readPid('0C')) ?? 0
    const coolantTemp = (await this.readPid('05')) ?? 0
    const speed = (await this.readPid('0D')) ?? 0
    const intakeTemp = (await this.readPid('0F')) ?? 0
    const dtcCodes = await this.readDtcCodes()
    const freezeFrame = await this.getFreezeFrame(dtcCodes[0]?.code)
    const severity = computeSeverity(dtcCodes.length, freezeFrame !== null)
    const parsedValues = { rpm, coolantTemp, speed, intakeTemp }
    return {
      rawData: JSON.stringify(parsedValues),
      parsedValues,
      dtcCodes,
      diagnosisText: buildDiagnosisText(dtcCodes, severity, freezeFrame),
      severity,
    }
  }
}
