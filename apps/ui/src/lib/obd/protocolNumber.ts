/**
 * Traduce el protocolo negociado por el ELM327 (`AT DPN`) a su bus CAN.
 * Puerto de `apps/core-api/src/infrastructure/elm327/protocolNumber.ts`.
 */
import { resolveCanBusByNumber, type CanBusDescriptor } from './ecuAddressCatalog'

export type { CanBusDescriptor }

const PROTOCOL_NUMBER_RE = /^A?([0-9A-C])$/

/** Resuelve el bus CAN a partir de la respuesta cruda de `AT DPN`. */
export function resolveCanBus(raw: string): CanBusDescriptor | null {
  for (const line of raw.split(/\r\n?|\n/)) {
    const cleaned = line.replace(/>/g, '').trim().toUpperCase()
    if (cleaned === '') continue
    const match = PROTOCOL_NUMBER_RE.exec(cleaned)
    if (match) return resolveCanBusByNumber(match[1])
  }
  return null
}
