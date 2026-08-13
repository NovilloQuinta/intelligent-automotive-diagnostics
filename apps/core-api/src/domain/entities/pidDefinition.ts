import { Formula } from '../value-objects/formula.js'
import type { PidCode } from '../value-objects/pidCode.js'

/** Error lanzado cuando falla la validacion de un PidDefinition. */
export class PidDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidDefinitionError'
  }
}

/**
 * Entidad que representa la definicion de un PID OBD-II (Mode 01, Mode 22, UDS, etc.).
 *
 * El campo `system` es una etiqueta de agrupacion opcional free-form (sin
 * validacion). Los valores `Engine`, `Transmission`, `Battery`, `Exhaust`,
 * `Emissions`, `Vehicle`, `Powertrain`, `ABS`, `Body`, `Airbag`, `Instrument`
 * son una convencion sugerida, no un vocabulario impuesto. No forma parte de
 * la identidad del PID, que sigue siendo `(mode, pidCode, manufacturer, model)`.
 */
export class PidDefinition {
  readonly id: number
  readonly pidCode: PidCode
  readonly name: string
  readonly description?: string
  readonly formula: Formula
  readonly unit?: string
  readonly dataBytes: number
  readonly pidType: string
  readonly minValue?: number
  readonly maxValue?: number
  readonly manufacturer?: string
  readonly model?: string
  readonly system?: string
  readonly confidence: number
  readonly source: 'auto' | 'llm_guess' | 'manual' | 'seed'
  readonly createdAt?: string

  /**
   * @param params - Propiedades de la definicion del PID.
   * @throws {PidDefinitionError} Si el nombre o la formula estan vacios,
   *   `dataBytes < 1`, o `confidence` esta fuera del rango [0, 1].
   */
  constructor(params: {
    id: number
    pidCode: PidCode
    name: string
    description?: string
    formula: string
    unit?: string
    dataBytes: number
    pidType: string
    minValue?: number
    maxValue?: number
    manufacturer?: string
    model?: string
    system?: string
    confidence: number
    source: 'auto' | 'llm_guess' | 'manual' | 'seed'
    createdAt?: string
  }) {
    if (!params.name.trim()) throw new PidDefinitionError('PID name must not be empty')
    if (!params.formula.trim()) throw new PidDefinitionError('PID formula must not be empty')
    if (params.dataBytes < 1)
      throw new PidDefinitionError(`dataBytes must be >= 1, got ${params.dataBytes}`)
    if (params.confidence < 0 || params.confidence > 1) {
      throw new PidDefinitionError(`confidence must be between 0 and 1, got ${params.confidence}`)
    }
    this.id = params.id
    this.pidCode = params.pidCode
    this.name = params.name.trim()
    this.description = params.description
    this.formula = new Formula(params.formula)
    this.unit = params.unit
    this.dataBytes = params.dataBytes
    this.pidType = params.pidType
    this.minValue = params.minValue
    this.maxValue = params.maxValue
    this.manufacturer = params.manufacturer
    this.model = params.model
    this.system = params.system
    this.confidence = params.confidence
    this.source = params.source
    this.createdAt = params.createdAt
  }
}
