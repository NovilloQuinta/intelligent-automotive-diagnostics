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
 * Los cuatro buses CAN de ISO 15765-4, indexados por su número de protocolo ELM327.
 *
 * Deliberadamente fuera: los protocolos 1–5 (J1850, ISO 9141-2, KWP2000) y el A
 * (J1939). No es que no se puedan leer —las lecturas normales funcionan en todos—,
 * es que el descubrimiento por broadcast funcional que hace {@link ./ecuDiscovery.ts}
 * no tiene equivalente fuera de CAN.
 */
const CAN_BUSES: Readonly<Record<string, CanBusDescriptor>> = {
  '6': {
    number: '6',
    label: 'CAN_11_500',
    functionalAddress: '7DF',
    ecmRequestAddress: '7E0',
    ecmResponseAddress: '7E8',
  },
  '7': {
    number: '7',
    label: 'CAN_29_500',
    functionalAddress: '18DB33F1',
    ecmRequestAddress: '18DA10F1',
    ecmResponseAddress: '18DAF110',
  },
  '8': {
    number: '8',
    label: 'CAN_11_250',
    functionalAddress: '7DF',
    ecmRequestAddress: '7E0',
    ecmResponseAddress: '7E8',
  },
  '9': {
    number: '9',
    label: 'CAN_29_250',
    functionalAddress: '18DB33F1',
    ecmRequestAddress: '18DA10F1',
    ecmResponseAddress: '18DAF110',
  },
}

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
  const cleaned = raw
    .replace(/[\r\n>]/g, '')
    .trim()
    .toUpperCase()
  const match = PROTOCOL_NUMBER_RE.exec(cleaned)
  if (!match) return null
  return CAN_BUSES[match[1]] ?? null
}
