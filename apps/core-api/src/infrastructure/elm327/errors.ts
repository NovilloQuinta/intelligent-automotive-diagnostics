/** Error de conexión TCP con el emulador ELM327 (timeout, rechazo, socket error). */
export class Elm327ConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Elm327ConnectionError'
  }
}

/** El emulador responde "NO DATA" — PID/DTC no soportado. */
export class Elm327NoDataError extends Error {
  constructor(raw: string) {
    super(`ELM327: no data for command (raw: "${raw}")`)
    this.name = 'Elm327NoDataError'
  }
}

/** Respuesta ELM327 ilegible o malformada. */
export class Elm327ParseError extends Error {
  constructor(raw: string) {
    super(`ELM327: unparseable response (raw: "${raw}")`)
    this.name = 'Elm327ParseError'
  }
}
