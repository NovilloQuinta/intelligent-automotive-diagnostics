/**
 * Negociacion de sesion con un ELM327 fisico por USB.
 * Puerto verbatim de `apps/core-api/src/infrastructure/elm327/initSequence.ts`.
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

/** Timeout de cada comando de negociacion (ATZ reinicia el chip, la busqueda de protocolo tarda). */
export const ELM327_INIT_TIMEOUT_MS = 12_000
