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
