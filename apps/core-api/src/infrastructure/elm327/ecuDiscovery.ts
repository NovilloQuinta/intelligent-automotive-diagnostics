import type {
  Elm327ExclusiveSession,
  Elm327Transport,
} from '@/application/ports/Elm327Transport.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { resolveEcuAddress } from '@/domain/ecuAddressCatalog.js'
import { parseCanHeaders } from './protocol.js'

/** Secuencia de inicialización AT previa al broadcast de descubrimiento. */
const ECU_SCAN_INIT_SEQUENCE = ['AT E0', 'AT L0', 'AT H1', 'AT SP 6', 'AT SH 7DF'] as const

/** Broadcast functional addressing: pregunta a todas las ECUs por su PID 00 soportado. */
const BROADCAST_REQUEST = '01 00'

/** Addressing físico al ECM (`AT SH 7E0`): fallback Mode 09 y header por defecto al restaurar. */
const ECM_REQUEST_ADDRESS = 'AT SH 7E0'

/**
 * Secuencia de restauración del estado ELM327 tras el scan.
 *
 * `readPid`/`readPids` no configuran headers propios y asumen el estado por
 * defecto (headers OFF + header físico ECM `7E0`); por eso se revierte el
 * `AT H1` (headers ON) y el `AT SH 7DF` (functional addressing) del scan.
 */
const ECU_SCAN_RESTORE_SEQUENCE = ['AT H0', ECM_REQUEST_ADDRESS] as const

/** Mode 09 PID 0A (ECU name): lee el nombre del ECM en el fallback. */
const ECU_NAME_REQUEST = '09 0A'

/** Dirección de respuesta del ECM (única estandarizada ISO 15765-4). */
const ECM_RESPONSE_ADDRESS = '7E8'

/** Protocolo del bus para ECUs descubiertas (ISO 15765-4 CAN 11-bit/500 kbps). */
const DISCOVERED_ECU_PROTOCOL = 'CAN_11_500'

/** Id provisional para ECUs aún no persistidas (autogenerado en la capa de persistencia). */
const UNASSIGNED_ID = 0

/**
 * Descubre las ECUs presentes en el bus CAN vía functional addressing.
 *
 * Emite la secuencia de inicialización AT (`ECU_SCAN_INIT_SEQUENCE`), lanza un
 * broadcast `01 00`, parsea los headers CAN de la respuesta y resuelve cada
 * dirección vía {@link resolveEcuAddress}. Si el broadcast no produce ninguna
 * ECU (adaptador/coche que no tolera functional addressing), cae al fallback:
 * addressing físico al ECM (`AT SH 7E0`) + Mode 09 PID 0A, devolviendo un único
 * ECM (`7E0`/`7E8`). Si ambos fallan, devuelve `[]`.
 *
 * @param transport - Transporte ELM327 inyectado (frontera de infraestructura).
 * @returns ECUs descubiertas, aún sin persistir (`id`/`vehicleId` = 0).
 */
export async function discoverEcus(transport: Elm327Transport): Promise<EcuInfo[]> {
  // La reserva es obligatoria, no una optimizacion: el scan cambia `AT H1` y
  // `AT SH 7DF`, que son estado global del adaptador. Sin ella, cualquier lectura
  // concurrente —la telemetria de la UI va a 1 Hz— cae entre medias y vuelve con
  // el header puesto o dirigida al broadcast.
  return transport.runExclusive(async (session) => {
    try {
      for (const command of ECU_SCAN_INIT_SEQUENCE) {
        await session.sendCommand(command)
      }
      const broadcastHeaders = parseCanHeaders(await session.sendCommand(BROADCAST_REQUEST))
      if (broadcastHeaders.length > 0) {
        return broadcastHeaders.map(toDiscoveredEcu)
      }
      return await discoverPrimaryEcu(session)
    } finally {
      await restoreElm327State(session)
    }
  })
}

/** Restaura el estado del ELM327 (headers OFF + header físico ECM) tras el scan. */
async function restoreElm327State(session: Elm327ExclusiveSession): Promise<void> {
  for (const command of ECU_SCAN_RESTORE_SEQUENCE) {
    await session.sendCommand(command)
  }
}

/** Fallback Mode 09 PID 0A: devuelve el ECM si el bus responde, `[]` en caso contrario. */
async function discoverPrimaryEcu(session: Elm327ExclusiveSession): Promise<EcuInfo[]> {
  await session.sendCommand(ECM_REQUEST_ADDRESS)
  const nameResponse = await session.sendCommand(ECU_NAME_REQUEST)
  if (isNoData(nameResponse)) return []
  return [toDiscoveredEcu(ECM_RESPONSE_ADDRESS)]
}

/** Construye la EcuInfo de una dirección de respuesta CAN resuelta. */
function toDiscoveredEcu(responseAddr: string): EcuInfo {
  const resolved = resolveEcuAddress(responseAddr)
  return new EcuInfo({
    id: UNASSIGNED_ID,
    vehicleId: UNASSIGNED_ID,
    name: resolved.name,
    requestAddr: resolved.requestAddr,
    responseAddr,
    type: resolved.type,
    protocol: DISCOVERED_ECU_PROTOCOL,
  })
}

/** Comprueba si una respuesta Mode 09 0A no aporta datos (error de bus, `NO DATA` o vacía). */
function isNoData(raw: string): boolean {
  const cleaned = raw.replace(/[\r\n>]/g, '').trim()
  if (cleaned === '' || cleaned === '?') return true
  return /NO DATA|CAN ERROR|UNABLE TO CONNECT|BUS INIT.*ERROR/i.test(raw)
}
