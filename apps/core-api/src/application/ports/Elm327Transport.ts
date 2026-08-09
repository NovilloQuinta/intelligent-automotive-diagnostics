/**
 * Contrato de transporte ELM327 — abstracción sobre TCP, Serial o Bluetooth.
 *
 * Cada implementación gestiona su propio stream subyacente (socket, puerto serie,
 * RFCOMM) y expone los mismos tres métodos para el adaptador OBD-II, que solo
 * consume el transporte sin conocer el medio físico.
 *
 * La cola FIFO, el mutex de escritura, la delimitación por prompt `>` y la
 * reconexión son responsabilidad interna de cada implementación.
 */
export interface Elm327Transport {
  /** Abre la conexión persistente al dispositivo. Idempotente: no-op si ya está abierta. */
  connect(): Promise<void>

  /**
   * Encola un comando ELM327 y resuelve con la respuesta cruda (incluyendo eco)
   * hasta el prompt `>`.
   */
  sendCommand(cmd: string): Promise<string>

  /**
   * Shutdown graceful: destruye el stream subyacente, limpia timers y rechaza
   * los comandos pendientes.
   */
  close(): Promise<void>
}
