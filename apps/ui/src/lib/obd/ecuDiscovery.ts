/**
 * Descubrimiento de ECUs por broadcast funcional CAN, portado de
 * `apps/core-api/src/infrastructure/elm327/ecuDiscovery.ts` para el transporte
 * USB nativo. Devuelve el mismo shape que `EcuInfo` de
 * `@/components/dashboard/types` (id/vehicleId en 0: aun sin persistir en BD).
 */
import type { EcuInfo } from '@/components/dashboard/types'
import { resolveEcuAddress } from './ecuAddressCatalog'
import { parseCanHeaders } from './protocol'
import { resolveCanBus, type CanBusDescriptor } from './protocolNumber'
import type { Elm327ExclusiveSession, Elm327TransportPort } from './transportPort'

const PROTOCOL_QUERY = 'AT DPN'
const ECU_SCAN_INIT_SEQUENCE = ['AT E0', 'AT L0', 'AT H1'] as const
const BROADCAST_REQUEST = '01 00'
const ECU_NAME_REQUEST = '09 0A'
const UNASSIGNED_ID = 0

function setHeader(address: string): string {
  return `AT SH ${address}`
}

/** Descubre las ECUs presentes en el bus CAN via functional addressing. */
export async function discoverEcus(transport: Elm327TransportPort): Promise<EcuInfo[]> {
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

async function restoreElm327State(
  session: Elm327ExclusiveSession,
  bus: CanBusDescriptor,
): Promise<void> {
  await session.sendCommand('AT H0')
  await session.sendCommand(setHeader(bus.ecmRequestAddress))
}

async function discoverPrimaryEcu(
  session: Elm327ExclusiveSession,
  bus: CanBusDescriptor,
): Promise<EcuInfo[]> {
  await session.sendCommand(setHeader(bus.ecmRequestAddress))
  const nameResponse = await session.sendCommand(ECU_NAME_REQUEST)
  if (isNoData(nameResponse)) return []
  return [toDiscoveredEcu(bus.ecmResponseAddress, bus)]
}

function toDiscoveredEcu(responseAddr: string, bus: CanBusDescriptor): EcuInfo {
  const resolved = resolveEcuAddress(responseAddr)
  return {
    id: UNASSIGNED_ID,
    vehicleId: UNASSIGNED_ID,
    name: resolved.name,
    requestAddr: resolved.requestAddr,
    responseAddr,
    type: resolved.type,
    protocol: bus.label,
    source: 'catalog',
  }
}

function isNoData(raw: string): boolean {
  const cleaned = raw.replace(/[\r\n>]/g, '').trim()
  if (cleaned === '' || cleaned === '?') return true
  return /NO DATA|CAN ERROR|UNABLE TO CONNECT|BUS INIT.*ERROR/i.test(raw)
}
