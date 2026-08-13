import type { CategorizedError, ErrorCategory } from '@/application/shared/errorCategory.js'

/** Error de conexión TCP con el dispositivo ELM327 (timeout, rechazo, socket error). */
export class Elm327ConnectionError extends Error implements CategorizedError {
  /** El bus/dispositivo es un tercero: reintentable. */
  readonly errorCategory: ErrorCategory = 'external_error'

  constructor(message: string) {
    super(message)
    this.name = 'Elm327ConnectionError'
  }
}

/** El dispositivo responde "NO DATA" — PID/DTC no soportado. */
export class Elm327NoDataError extends Error implements CategorizedError {
  /** Se pidio algo que el vehiculo no soporta: reintentar igual no sirve. */
  readonly errorCategory: ErrorCategory = 'client_error'

  constructor(raw: string) {
    super(`ELM327: no data for command (raw: "${raw}")`)
    this.name = 'Elm327NoDataError'
  }
}

/** Respuesta ELM327 ilegible o malformada. */
export class Elm327ParseError extends Error implements CategorizedError {
  /** Sabemos leer el protocolo: si no parsea, el fallo es nuestro. */
  readonly errorCategory: ErrorCategory = 'server_error'

  constructor(raw: string) {
    super(`ELM327: unparseable response (raw: "${raw}")`)
    this.name = 'Elm327ParseError'
  }
}
