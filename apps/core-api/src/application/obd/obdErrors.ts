/**
 * El adaptador no puede entregar los bytes crudos de este PID.
 *
 * Forma parte del contrato del puerto {@link ObdRepository}, no de un adaptador concreto: el
 * simulador la lanza para cualquier PID que su escenario no modela, y la capa de aplicacion la
 * captura para degradar la validacion sin romper. Por eso vive en `application/` junto al
 * puerto, igual que `application/llm/llmErrors.ts`, y no en `infrastructure/elm327/errors.ts`.
 */
export class PidRawReadNotSupportedError extends Error {
  constructor(mode: string, pid: string) {
    super(`Raw read not supported for PID ${mode} ${pid}`)
    this.name = 'PidRawReadNotSupportedError'
  }
}
