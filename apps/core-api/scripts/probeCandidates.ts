/**
 * Filtro de puertos serie que pueden ser un adaptador OBD.
 *
 * Vive en su propio modulo, separado de la sonda, para poder probarlo sin abrir
 * hardware: es la parte con logica de verdad y la que decide si la sesion con el
 * coche arranca o se pierde probando puertos inexistentes.
 */

/**
 * Puertos que corresponden a un dispositivo USB o Bluetooth real.
 *
 * - `ttyUSB` clones CH340/FTDI en Linux; `ttyACM` adaptadores STN y CDC.
 * - `cu.usbserial` / `cu.usbmodem` / `cu.SLAB` / `cu.wchusbserial` en macOS, que
 *   usa el dispositivo *callout* (`cu.`) y no el de llamada entrante (`tty.`).
 * - `rfcomm` un adaptador Bluetooth ya emparejado y enlazado.
 */
const ADAPTER_PORT_RE =
  /\/(?:ttyUSB\d|ttyACM\d|rfcomm\d|(?:cu|tty)\.(?:usbserial|usbmodem|SLAB|wchusbserial))/i

/**
 * Puerto de Bluetooth entrante que macOS expone siempre. Nunca es el adaptador,
 * y abrirlo cuelga la sonda hasta el timeout.
 */
const NEVER_THE_ADAPTER_RE = /Bluetooth-Incoming-Port/i

/**
 * Se queda con los puertos que pueden ser un adaptador, en orden de descubrimiento.
 *
 * Linux expone `/dev/ttyS0`..`/dev/ttyS31` siempre, haya o no hardware detras:
 * probarlos uno a uno son 32 aperturas fallidas que entierran el diagnostico util
 * bajo un muro de errores de permisos.
 *
 * @param paths - Rutas devueltas por la enumeracion del sistema.
 * @returns Solo las rutas con pinta de adaptador, en el mismo orden.
 */
export function selectAdapterCandidates(paths: readonly string[]): string[] {
  return paths.filter((p) => ADAPTER_PORT_RE.test(p) && !NEVER_THE_ADAPTER_RE.test(p))
}
