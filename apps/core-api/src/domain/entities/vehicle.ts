/**
 * Modelo del vehículo: marca, modelo, año y tipo de motor.
 * Se usa para contextualizar el diagnóstico (cada modelo tiene
 * patrones de fallo conocidos distintos).
 */
export interface VehicleInfo {
  /** Marca del vehículo (ej. "Audi", "Kawasaki") */
  make: string
  /** Modelo específico (ej. "A3", "Ninja ZX-6R") */
  model: string
  /** Año de fabricación */
  year: number
  /** Tipo de motor (ej. "2.0 TDI", "636cc inline-4") */
  engineType: string
}

/**
 * Dato en vivo de un sensor OBD-II.
 * Cada PID devuelve un valor físico concreto en un instante dado.
 */
export interface LiveData {
  /** Revoluciones por minuto del motor */
  rpm: number
  /** Temperatura del refrigerante en °C */
  coolantTemp: number
  /** Velocidad del vehículo en km/h */
  speed: number
  /** Temperatura del aire de admisión en °C */
  intakeTemp: number
  /**
   * Estado del ABS, si aplica.
   * En vehículos sin ABS será `undefined`.
   */
  absStatus?: 'normal' | 'fault'
}

/**
 * Código de diagnóstico de problema (DTC — Diagnostic Trouble Code).
 * Sigue el estándar SAE J2012: letra (P/B/C/U) + 4 dígitos.
 */
export interface DtcCode {
  /** Código alfanumérico (ej. "P0118", "C0045") */
  code: string
  /** Descripción legible del fallo según estándar */
  description: string
}

/**
 * Resultado completo de un diagnóstico sobre el vehículo.
 * Agrupa los datos crudos, los valores parseados, los DTCs
 * y el diagnóstico generado (tanto determinista como por IA).
 */
export interface DiagnosisResult {
  /** Trama hexadecimal original recibida del simulador */
  rawHex: string
  /** Valores de sensores parseados según SAE J1979 */
  parsedValues: LiveData
  /** Códigos de error activos detectados */
  dtcCodes: DtcCode[]
  /**
   * Diagnóstico generado.
   * Puede ser el resultado del diagnóstico determinista por umbrales
   * o el narrativo generado por el LLM.
   */
  diagnosisText: string
  /**
   * Nivel de severidad estimado.
   * - low: mantenimiento rutinario
   * - medium: requiere atención próxima
   * - high: debe revisarse pronto
   * - critical: riesgo de daño grave, detener el vehículo
   */
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Perfil de simulación que define el comportamiento del vehículo virtual.
 * Cada escenario equivale a un "estado" del vehículo (normal, avería X, avería Y).
 */
export interface SimulationScenario {
  /** Identificador único del escenario */
  id: string
  /** Nombre legible (ej. "Audi A3 — Fallo de refrigeración") */
  name: string
  /** Tipo de vehículo que simula */
  vehicleType: 'car' | 'motorcycle'
  /** Valores de sensores que devolverá el simulador */
  pidConfig: LiveData
  /** Códigos DTC activos en este escenario */
  dtcConfig: DtcCode[]
}
