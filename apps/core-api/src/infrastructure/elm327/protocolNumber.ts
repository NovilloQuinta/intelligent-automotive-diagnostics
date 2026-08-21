import {
  resolveCanBusByNumber,
  type CanBusDescriptor,
} from '@/domain/catalogs/ecuAddressCatalog.js'

/**
 * Traduce el protocolo que el adaptador ELM327 ya negoció con el vehículo.
 *
 * El bitrate del bus no lo fija este proyecto: lo elige el propio adaptador
 * durante el `ATSP0` del init ({@link ./initSequence.ts}), que prueba los diez
 * protocolos y se queda con el que conteste. Elegir el protocolo *es* elegir el
 * bitrate — no son dos ajustes. Aquí solo se pregunta cuál salió, con `AT DPN`.
 *
 * Qué significa cada número —qué ancho de identificador, qué bitrate, qué
 * direcciones— lo fija ISO 15765-4 y vive en el catálogo de dominio
 * ({@link resolveCanBusByNumber}). Este módulo solo se ocupa de la parte que es
 * dialecto del adaptador: extraer el número de una respuesta concreta de `AT DPN`.
 */

/** Bus CAN negociado, con las direcciones que ISO 15765-4 le asigna. */
export type { CanBusDescriptor }

/**
 * Respuesta de `AT DPN`: un solo carácter, con `A` delante si el protocolo se
 * negoció en automático (`'A6'`). Un `A` suelto es ambiguo entre el protocolo A
 * (J1939) y el prefijo sin dígito; da igual, porque las dos lecturas caen fuera
 * del barrido.
 */
const PROTOCOL_NUMBER_RE = /^A?([0-9A-C])$/

/**
 * Resuelve el bus CAN a partir de la respuesta cruda de `AT DPN`.
 *
 * @param raw - Respuesta del adaptador, con sus terminadores y prompt.
 * @returns El bus si el vehículo negoció CAN; `null` si negoció un protocolo
 *   anterior a CAN o si la respuesta no identifica ninguno. **Nunca supone un
 *   protocolo por defecto**: es justo lo que hacía el `AT SP 6` que esto sustituye.
 */
export function resolveCanBus(raw: string): CanBusDescriptor | null {
  // Se lee linea a linea y no como una cadena aplanada porque `AT DPN` es el
  // primer comando del barrido, **antes** de que `AT E0` apague el eco: la
  // respuesta llega con el comando repetido delante. Aplanarla daria "AT DPNA6",
  // que no identifica nada, y el barrido se abstendria en un coche perfectamente
  // capaz. Verificado contra el ELM327-emulator, que arranca con el eco puesto.
  for (const line of raw.split(/\r\n?|\n/)) {
    const cleaned = line.replace(/>/g, '').trim().toUpperCase()
    if (cleaned === '') continue
    const match = PROTOCOL_NUMBER_RE.exec(cleaned)
    if (match) return resolveCanBusByNumber(match[1])
  }
  return null
}
