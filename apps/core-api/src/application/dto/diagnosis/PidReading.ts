/**
 * Lectura generica de un PID en la respuesta `readings` de la telemetria en vivo.
 *
 * No confundir con la entidad {@link ../../../domain/entities/PidReading.js | PidReading}
 * del dominio, que es la lectura persistida contra un vehiculo. Esta es la proyeccion que
 * viaja al cliente: sin identidad y con el nombre y la unidad ya resueltos del catalogo.
 */
export interface PidReading {
  /** Clave compuesta modo + PID separados por espacio (ej. "01 0C"). */
  readonly code: string
  /** Nombre legible del PID (del catalogo `ALL_SEED_PIDS`). */
  readonly name: string
  /** Unidad fisica del valor (ej. "rpm", "°C"). */
  readonly unit: string
  /** Valor fisico resuelto; `null` si la lectura fallo (NO DATA). */
  readonly value: number | null
}
