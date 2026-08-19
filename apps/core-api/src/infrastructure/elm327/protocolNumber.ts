/**
 * Traduce el protocolo que el adaptador ELM327 ya negoció con el vehículo.
 *
 * El bitrate del bus no lo fija este proyecto: lo elige el propio adaptador
 * durante el `ATSP0` del init ({@link ./initSequence.ts}), que prueba los diez
 * protocolos y se queda con el que conteste. Elegir el protocolo *es* elegir el
 * bitrate — no son dos ajustes. Aquí solo se pregunta cuál salió, con `AT DPN`.
 */

/** Bus CAN negociado, con las direcciones que ISO 15765-4 le asigna. */
export interface CanBusDescriptor {
  /** Número de protocolo ELM327, ya sin el prefijo de negociación automática. */
  readonly number: string
  /** Etiqueta que se persiste en `EcuInfo.protocol`. */
  readonly label: string
  /** Dirección de broadcast funcional: a quién se pregunta para descubrir ECUs. */
  readonly functionalAddress: string
  /** Dirección física de petición al ECU de motor. */
  readonly ecmRequestAddress: string
  /** Dirección desde la que responde el ECU de motor. */
  readonly ecmResponseAddress: string
}

/**
 * Direccionamiento ISO 15765-4, que depende del ancho del identificador CAN y no
 * del bitrate: los protocolos 6 y 8 comparten el de 11 bits, y el 7 y el 9 el de
 * 29 bits.
 *
 * En 29 bits la respuesta **no** es la petición más 8 como en 11 bits: se
 * intercambian los dos últimos bytes (`18DA10F1` pregunta, `18DAF110` contesta).
 */
const ISO_15765_4_ADDRESSING = {
  CAN_11: { functionalAddress: '7DF', ecmRequestAddress: '7E0', ecmResponseAddress: '7E8' },
  CAN_29: {
    functionalAddress: '18DB33F1',
    ecmRequestAddress: '18DA10F1',
    ecmResponseAddress: '18DAF110',
  },
} as const

/**
 * Los cuatro buses CAN de ISO 15765-4, indexados por su número de protocolo ELM327.
 *
 * La tabla es dato puro: número → ancho de identificador y bitrate. Lo demás lo
 * aporta {@link ISO_15765_4_ADDRESSING}.
 *
 * Deliberadamente fuera: los protocolos 1–5 (J1850, ISO 9141-2, KWP2000) y el A
 * (J1939). No es que no se puedan leer —las lecturas normales funcionan en todos—,
 * es que el descubrimiento por broadcast funcional que hace {@link ./ecuDiscovery.ts}
 * no tiene equivalente fuera de CAN.
 */
const CAN_BUS_TABLE: ReadonlyArray<
  readonly [number: string, width: 'CAN_11' | 'CAN_29', kbps: string]
> = [
  ['6', 'CAN_11', '500'],
  ['7', 'CAN_29', '500'],
  ['8', 'CAN_11', '250'],
  ['9', 'CAN_29', '250'],
]

const CAN_BUSES: Readonly<Record<string, CanBusDescriptor>> = Object.fromEntries(
  CAN_BUS_TABLE.map(([number, width, kbps]) => [
    number,
    { number, label: `${width}_${kbps}`, ...ISO_15765_4_ADDRESSING[width] },
  ]),
)

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
    if (match) return CAN_BUSES[match[1]] ?? null
  }
  return null
}
