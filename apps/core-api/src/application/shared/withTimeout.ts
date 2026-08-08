/**
 * Timeout total esperado para diagnosticos y tool calls (ms).
 * Compartido entre {@link ProcessVehicleDiagnosisUseCase} y {@link DiagnosisController}.
 */
export const DIAGNOSIS_TIMEOUT_MS = 10_000

/**
 * Error con el que rechaza {@link withTimeout} al agotarse el plazo.
 *
 * Existe para que quien lo captura discrimine por tipo y no comparando el
 * mensaje, que es texto para humanos y no un contrato.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimeoutError'
  }
}

/**
 * Envuelve una promesa con un timeout total. Limpia el timer de la rama
 * perdedora para evitar {@link https://nodejs.org/api/process.html#event-unhandledrejection|unhandledRejection}.
 *
 * @param promise - Promesa a acotar temporalmente.
 * @param timeoutMs - Tiempo maximo en milisegundos antes de rechazar.
 * @param errorMessage - Mensaje del Error lanzado si se supera el timeout.
 * @returns Promesa que resuelve con el valor de `promise` o rechaza al superar `timeoutMs`.
 * @throws {TimeoutError} Con `errorMessage` si `promise` no resuelve antes de `timeoutMs`.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(errorMessage)), timeoutMs)
  })

  return Promise.race([promise, timeout]).finally(() => {
    // Limpiar el timer para evitar unhandled rejection cuando promise
    // gana la carrera (el reject del timeout nunca se dispara).
    if (timer !== undefined) clearTimeout(timer)
    // Suprimir late rejection de la rama promise cuando el timeout
    // gana la carrera (la promesa original rechaza despues del race).
    promise.catch(() => {})
  })
}
