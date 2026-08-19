import type {
  Elm327ExclusiveSession,
  Elm327Transport,
} from '@/application/ports/Elm327Transport.js'
import { EcuInfo } from '@/domain/entities/ecuInfo.js'
import { resolveEcuAddress } from '@/domain/ecuAddressCatalog.js'
import { parseCanHeaders } from './protocol.js'
import { resolveCanBus, type CanBusDescriptor } from './protocolNumber.js'

/**
 * Consulta del protocolo que el adaptador ya negoció con el vehículo.
 *
 * Es el primer comando del barrido y no modifica nada: solo pregunta. Antes aquí
 * se emitía `AT SP 6`, que **imponía** CAN de 11 bits a 500 kbps y no se
 * deshacía al terminar, de modo que en un vehículo con cualquier otro bus el
 * barrido no solo fallaba — dejaba el adaptador fijado a un protocolo que el
 * coche no habla, y con él caían también la telemetría, los DTC y el VIN.
 */
const PROTOCOL_QUERY = 'AT DPN'

/** Secuencia de inicialización AT previa al broadcast, sin la dirección de destino. */
const ECU_SCAN_INIT_SEQUENCE = ['AT E0', 'AT L0', 'AT H1'] as const

/** Broadcast functional addressing: pregunta a todas las ECUs por su PID 00 soportado. */
const BROADCAST_REQUEST = '01 00'

/** Mode 09 PID 0A (ECU name): lee el nombre del ECM en el fallback. */
const ECU_NAME_REQUEST = '09 0A'

/** Id provisional para ECUs aún no persistidas (autogenerado en la capa de persistencia). */
const UNASSIGNED_ID = 0

/** Construye el comando que fija la dirección de destino de las peticiones. */
function setHeader(address: string): string {
  return `AT SH ${address}`
}

/**
 * Descubre las ECUs presentes en el bus CAN vía functional addressing.
 *
 * Pregunta primero qué protocolo negoció el adaptador ({@link PROTOCOL_QUERY}) y
 * deriva de ahí la dirección de broadcast. Si el vehículo no habla CAN —J1850,
 * ISO 9141-2, KWP2000— **se abstiene sin emitir un solo comando de
 * configuración**: el descubrimiento por broadcast no tiene equivalente fuera de
 * CAN, y tocar el adaptador para nada rompería las lecturas que sí funcionan.
 *
 * Si el broadcast no produce ninguna ECU (adaptador o coche que no tolera
 * functional addressing), cae al fallback: addressing físico al ECM + Mode 09
 * PID 0A. Si ambos fallan, devuelve `[]`.
 *
 * @param transport - Transporte ELM327 inyectado (frontera de infraestructura).
 * @returns ECUs descubiertas, aún sin persistir (`id`/`vehicleId` = 0).
 */
export async function discoverEcus(transport: Elm327Transport): Promise<EcuInfo[]> {
  // La reserva es obligatoria, no una optimizacion: el scan cambia `AT H1` y la
  // dirección de destino, que son estado global del adaptador. Sin ella, cualquier
  // lectura concurrente —la telemetria de la UI va a 1 Hz— cae entre medias y
  // vuelve con el header puesto o dirigida al broadcast.
  return transport.runExclusive(async (session) => {
    const bus = resolveCanBus(await session.sendCommand(PROTOCOL_QUERY))
    if (bus === null) return []
    try {
      return await scanCanBus(session, bus)
    } finally {
      await restoreElm327State(session, bus)
    }
  })
}

/** Barre el bus ya sabiendo cuál es: broadcast funcional y, si calla, fallback al ECM. */
async function scanCanBus(
  session: Elm327ExclusiveSession,
  bus: CanBusDescriptor,
): Promise<EcuInfo[]> {
  for (const command of ECU_SCAN_INIT_SEQUENCE) {
    await session.sendCommand(command)
  }
  await session.sendCommand(setHeader(bus.functionalAddress))
  const broadcastHeaders = parseCanHeaders(await session.sendCommand(BROADCAST_REQUEST))
  if (broadcastHeaders.length > 0) {
    return broadcastHeaders.map((header) => toDiscoveredEcu(header, bus))
  }
  return await discoverPrimaryEcu(session, bus)
}

/**
 * Restaura el estado del ELM327 tras el scan: headers apagados y la dirección
 * **física** del ECM, que es a la que van dirigidas las lecturas normales.
 *
 * No se restaura a la dirección funcional aunque sea el valor de fábrica del
 * adaptador. Comprobado contra el ELM327-emulator, sobre una sola conexión:
 *
 * ```
 * AT SH 7DF  →  01 0C  →  NO DATA
 * AT SH 7E0  →  01 0C  →  41 0C 0C 08
 * ```
 *
 * El broadcast funcional sirve para preguntar quién hay en el bus, no para leer
 * PIDs: dejarlo puesto tumba la telemetría hasta la siguiente reconexión.
 */
async function restoreElm327State(
  session: Elm327ExclusiveSession,
  bus: CanBusDescriptor,
): Promise<void> {
  await session.sendCommand('AT H0')
  await session.sendCommand(setHeader(bus.ecmRequestAddress))
}

/** Fallback Mode 09 PID 0A: devuelve el ECM si el bus responde, `[]` en caso contrario. */
async function discoverPrimaryEcu(
  session: Elm327ExclusiveSession,
  bus: CanBusDescriptor,
): Promise<EcuInfo[]> {
  await session.sendCommand(setHeader(bus.ecmRequestAddress))
  const nameResponse = await session.sendCommand(ECU_NAME_REQUEST)
  if (isNoData(nameResponse)) return []
  return [toDiscoveredEcu(bus.ecmResponseAddress, bus)]
}

/** Construye la EcuInfo de una dirección de respuesta CAN resuelta. */
function toDiscoveredEcu(responseAddr: string, bus: CanBusDescriptor): EcuInfo {
  const resolved = resolveEcuAddress(responseAddr)
  return new EcuInfo({
    id: UNASSIGNED_ID,
    vehicleId: UNASSIGNED_ID,
    name: resolved.name,
    requestAddr: resolved.requestAddr,
    responseAddr,
    type: resolved.type,
    protocol: bus.label,
  })
}

/** Comprueba si una respuesta Mode 09 0A no aporta datos (error de bus, `NO DATA` o vacía). */
function isNoData(raw: string): boolean {
  const cleaned = raw.replace(/[\r\n>]/g, '').trim()
  if (cleaned === '' || cleaned === '?') return true
  return /NO DATA|CAN ERROR|UNABLE TO CONNECT|BUS INIT.*ERROR/i.test(raw)
}
