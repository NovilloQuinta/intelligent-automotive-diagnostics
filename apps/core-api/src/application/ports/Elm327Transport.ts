/**
 * Vista del transporte dentro de una secuencia exclusiva.
 *
 * Sus comandos saltan la reserva porque son los que la poseen; los de
 * {@link Elm327Transport.sendCommand} esperan a que termine.
 */
export interface Elm327ExclusiveSession {
  /** Igual que {@link Elm327Transport.sendCommand}, pero dentro de la reserva. */
  sendCommand(cmd: string): Promise<string>
}

/**
 * Contrato de transporte ELM327 — abstracción sobre TCP, Serial o Bluetooth.
 *
 * Cada implementación gestiona su propio stream subyacente (socket, puerto serie,
 * RFCOMM) y expone los mismos métodos para el adaptador OBD-II, que solo
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
   * Reserva la conexión para una secuencia entera de comandos.
   *
   * El ELM327 tiene estado global: `AT H1` y `AT SH xxx` cambian cómo responde
   * a *todo* lo que venga después. La cola FIFO ordena comandos sueltos, no
   * secuencias, así que sin esta reserva un `01 0C` de la telemetría se cuela
   * entre el `AT SH 7DF` del barrido de ECUs y su restauración, y vuelve con el
   * header puesto o dirigido a la dirección de broadcast.
   *
   * Mientras la reserva está viva, `sendCommand` espera. Se libera siempre, aunque
   * la secuencia falle.
   *
   * @param fn - Secuencia a ejecutar; recibe la sesión con la que emitir.
   * @returns Lo que devuelva `fn`.
   */
  runExclusive<T>(fn: (session: Elm327ExclusiveSession) => Promise<T>): Promise<T>

  /**
   * Shutdown graceful: destruye el stream subyacente, limpia timers y rechaza
   * los comandos pendientes.
   */
  close(): Promise<void>
}
