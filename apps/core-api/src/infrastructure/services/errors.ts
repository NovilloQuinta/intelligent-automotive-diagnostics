/**
 * Errores tipados del servicio de diagnostico.
 *
 * Separados de `diagnosisService.ts` para que los controladores HTTP importen
 * errores sin arrastrar la implementacion del servicio. Los errores propios de
 * la invocacion de tools MCP viven en `infrastructure/mcp/errors.ts`.
 */

/** Error lanzado cuando el escenario de diagnostico no existe. */
export class DiagnosisScenarioNotFoundError extends Error {
  constructor(message: string = 'Scenario not found') {
    super(message)
    this.name = 'DiagnosisScenarioNotFoundError'
  }
}

/** Error lanzado cuando el diagnostico cognitivo no esta disponible (sin LLM configurado). */
export class CognitiveDiagnosisUnavailableError extends Error {
  constructor(message: string = 'Cognitive diagnosis is not available') {
    super(message)
    this.name = 'CognitiveDiagnosisUnavailableError'
  }
}

/** Error lanzado cuando el diagnostico cognitivo excede el timeout. */
export class CognitiveDiagnosisTimeoutError extends Error {
  constructor(message: string = 'Cognitive diagnosis timed out') {
    super(message)
    this.name = 'CognitiveDiagnosisTimeoutError'
  }
}

/** Error lanzado cuando el `sessionId` de un follow-up no existe o no pertenece al usuario. */
export class DiagnosisSessionNotFoundError extends Error {
  constructor(message: string = 'Diagnosis session not found') {
    super(message)
    this.name = 'DiagnosisSessionNotFoundError'
  }
}

/** Error lanzado cuando se intenta identificar un vehiculo sin persistencia configurada. */
export class VehicleIdentificationUnavailableError extends Error {
  constructor(message: string = 'Vehicle identification is not available') {
    super(message)
    this.name = 'VehicleIdentificationUnavailableError'
  }
}
