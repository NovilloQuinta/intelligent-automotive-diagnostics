/** Definición de un PID OBD-II (Mode 01, Mode 22, UDS, etc.) con su fórmula de conversión. */
export interface PidDefinition {
  readonly id?: number
  readonly vehicleId?: number
  readonly ecuId?: number
  readonly mode: string
  readonly pidCode: string
  readonly name: string
  readonly description?: string
  readonly formula: string
  readonly unit?: string
  readonly minValue?: number
  readonly maxValue?: number
  readonly confidence: number
  readonly source: 'auto' | 'llm_guess' | 'manual'
  readonly createdAt?: string
}

/** Lectura de un PID en una sesión de diagnóstico. */
export interface PidReading {
  readonly id?: number
  readonly pidDefId?: number
  readonly sessionId: string
  readonly rawHex: string
  readonly parsedValue?: number
  readonly timestamp?: string
}
