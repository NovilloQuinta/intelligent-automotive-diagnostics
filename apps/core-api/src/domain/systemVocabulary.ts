/**
 * Vocabulario controlado de etiquetas `system` (Decision 3 del cambio
 * `add-ecu-discovery-and-system-catalog`).
 *
 * `system` es una etiqueta de agrupacion free-form (sin validacion estricta en
 * las entidades). Estas constantes nombradas evitan magic strings en los seeds
 * y garantizan que un mismo sistema use siempre el mismo literal.
 */

/** Sistema de propulsion: motor de combustion y su gestion electronica. */
export const SYSTEM_ENGINE = 'Engine' as const

/** Sistema de transmision (TCU). */
export const SYSTEM_TRANSMISSION = 'Transmission' as const

/** Sistema electrico de baterias (12V o hibrida). */
export const SYSTEM_BATTERY = 'Battery' as const

/** Sistema de escape y postratamiento de gases (DPF, etc.). */
export const SYSTEM_EXHAUST = 'Exhaust' as const

/** Sistema de control de emisiones (EGR, etc.). */
export const SYSTEM_EMISSIONS = 'Emissions' as const

/** Parametros a nivel de vehiculo (velocidad, nivel de combustible, ambiente). */
export const SYSTEM_VEHICLE = 'Vehicle' as const
