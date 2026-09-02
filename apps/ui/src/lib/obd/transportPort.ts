/**
 * Contrato de transporte ELM327 del lado cliente — espejo de
 * `apps/core-api/src/application/ports/Elm327TransportPort.ts` para el USB
 * nativo de Android. Mismo contrato, misma razon de ser: la cola FIFO, el
 * mutex de escritura, la delimitacion por prompt `>` y la reserva exclusiva
 * son responsabilidad de la implementacion, no del que lo consume.
 */

/** Vista del transporte dentro de una secuencia exclusiva. */
export interface Elm327ExclusiveSession {
  sendCommand(cmd: string): Promise<string>
}

/** Transporte ELM327 sobre el plugin USB nativo de Capacitor. */
export interface Elm327TransportPort {
  connect(): Promise<void>
  sendCommand(cmd: string): Promise<string>
  runExclusive<T>(fn: (session: Elm327ExclusiveSession) => Promise<T>): Promise<T>
  close(): Promise<void>
}
