import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { TelemetryOutput } from '@/application/dto/diagnosis/TelemetryOutput.js'
import type { PidReading } from '@/application/dto/diagnosis/PidReading.js'
import { PID_METADATA } from '@/domain/catalogs/pidCatalog.js'
import {
  MODE_CURRENT_DATA,
  PID_COOLANT_TEMP,
  PID_RPM,
  PID_SPEED,
  PID_INTAKE_TEMP,
  DEFAULT_LIVE_PIDS,
} from '@/domain/pids.js'

/** Telemetria en vivo: los cuatro campos con tipo mas una lectura por PID pedido. */
export type GetLiveDataOutput = Partial<TelemetryOutput> & {
  readonly readings: PidReading[]
}

/**
 * Los cuatro PIDs que alimentan los relojes fijos del panel.
 *
 * Son cuatro porque cuatro son los relojes, no porque el catalogo se quede corto: el resto
 * de PIDs Mode 01 salen por `readings`, con su nombre y unidad de {@link PID_METADATA}.
 */
const GAUGE_FIELD_BY_PID: Readonly<Record<string, keyof TelemetryOutput>> = {
  [PID_COOLANT_TEMP]: 'coolantTemp',
  [PID_RPM]: 'rpm',
  [PID_SPEED]: 'speed',
  [PID_INTAKE_TEMP]: 'intakeTemp',
}

/**
 * Lee la telemetria en vivo del vehiculo activo.
 *
 * Recibe el `ObdRepository` ya resuelto en {@link execute}: **elegir que adaptador
 * corresponde a cada escenario es infraestructura**, y este caso de uso no debe conocer
 * ni los escenarios ni el modo de conexion.
 *
 * No tiene dependencias que inyectar —solo lee por el puerto que recibe—, asi que no
 * declara constructor.
 */
export class GetLiveDataUseCase {
  /**
   * @param repository - Repositorio OBD del vehiculo activo, ya resuelto.
   * @param pids - PIDs a leer; si se omiten, se leen los {@link DEFAULT_LIVE_PIDS}.
   * @returns Los campos de los relojes mas una lectura por PID pedido. Un PID que el
   *   vehiculo no soporta degrada a `null` en vez de romper la respuesta entera.
   */
  async execute(repository: ObdRepository, pids?: readonly string[]): Promise<GetLiveDataOutput> {
    const requested = (pids && pids.length > 0 ? pids : DEFAULT_LIVE_PIDS).map((pid) =>
      pid.toUpperCase(),
    )
    const values = await repository.readPids(MODE_CURRENT_DATA, requested)

    const gauges: Partial<TelemetryOutput> = {}
    const readings: PidReading[] = []
    for (const pid of requested) {
      const field = GAUGE_FIELD_BY_PID[pid]
      if (field) gauges[field] = values.get(pid) ?? null
      const metadata = PID_METADATA.get(pid)
      readings.push({
        code: `${MODE_CURRENT_DATA} ${pid}`,
        name: metadata?.name ?? pid,
        unit: metadata?.unit ?? '',
        value: values.get(pid) ?? null,
      })
    }
    return { ...gauges, readings }
  }
}
