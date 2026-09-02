/**
 * Errores ELM327 del lado cliente (Android nativo, USB directo).
 *
 * Puerto de `apps/core-api/src/infrastructure/elm327/errors.ts`: mismo
 * significado, sin `CategorizedError` porque esa taxonomia vive en la capa de
 * aplicacion del backend y aqui no hace falta — el error solo se muestra en la
 * UI o se relanza.
 */

/** Error de conexion con el dispositivo ELM327 (USB desconectado, timeout, permiso denegado). */
export class Elm327ConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Elm327ConnectionError'
  }
}

/** El dispositivo responde "NO DATA" — PID/DTC no soportado. */
export class Elm327NoDataError extends Error {
  constructor(raw: string) {
    super(`ELM327: no data for command (raw: "${raw}")`)
    this.name = 'Elm327NoDataError'
  }
}

/** El adaptador responde, pero el bus del vehiculo no coopera. */
export class Elm327BusError extends Error {
  constructor(reason: string, raw: string) {
    super(`${reason} (respuesta del adaptador: "${raw.trim()}")`)
    this.name = 'Elm327BusError'
  }
}

/** Respuesta ELM327 ilegible o malformada. */
export class Elm327ParseError extends Error {
  constructor(raw: string) {
    super(`ELM327: unparseable response (raw: "${raw}")`)
    this.name = 'Elm327ParseError'
  }
}
