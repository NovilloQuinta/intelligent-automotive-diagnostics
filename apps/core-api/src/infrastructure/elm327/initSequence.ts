/**
 * Negociación de sesión con un ELM327 físico.
 *
 * Un adaptador real arranca con el echo activado y sin protocolo seleccionado,
 * asi que sin esta secuencia la primera lectura llega con el comando repetido
 * delante y el bus sin abrir. El emulador no la necesita: no tiene bus que
 * buscar ni configuración que recordar.
 */

/**
 * Orden de la secuencia:
 *
 * - `ATZ` reinicia el adaptador y lo deja en un estado conocido, sin arrastrar
 *   ajustes guardados de una sesión anterior.
 * - `ATE0` apaga el echo, que si no antepone el comando a cada respuesta.
 * - `ATL0` quita los saltos de línea intermedios.
 * - `ATS1` **mantiene los espacios entre bytes**: el parser separa por espacios
 *   ({@link ./protocol.ts}), asi que apagarlos con `ATS0` romperia toda lectura.
 * - `ATH0` oculta las cabeceras de respuesta, que descuadran los prefijos `4X YY`.
 * - `ATSP0` deja al adaptador negociar el protocolo del vehiculo.
 * - `0100` fuerza la búsqueda de protocolo aqui, con el timeout largo, para que
 *   las lecturas posteriores no se coman el `SEARCHING...` con el timeout corto.
 */
export const ELM327_INIT_COMMANDS: readonly string[] = [
  'ATZ',
  'ATE0',
  'ATL0',
  'ATS1',
  'ATH0',
  'ATSP0',
  '0100',
]

/**
 * Timeout de cada comando de negociación.
 *
 * `ATZ` tarda un par de segundos en reiniciar el chip y la búsqueda de protocolo
 * de `0100` puede irse a varios segundos mas en un vehiculo real, sobre todo con
 * los protocolos lentos previos a CAN.
 */
export const ELM327_INIT_TIMEOUT_MS = 12_000
