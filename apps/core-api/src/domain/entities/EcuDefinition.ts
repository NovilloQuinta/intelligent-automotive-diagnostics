/** Error lanzado cuando falla la validacion de una definicion de ECU. */
export class EcuDefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EcuDefinitionError'
  }
}

/** Formato valido de direccion CAN: uno o mas digitos hexadecimales. */
const CAN_ADDR_REGEX = /^[0-9A-Fa-f]+$/

/**
 * Convierte la procedencia cruda a su union valida; lanza si no es `web`, `mechanic`
 * ni `seed` (ADR-007 §4). `seed` es la unica que no llega nunca por la tool MCP
 * `index_ecu` (su schema solo admite `web`/`mechanic`): la escribe directamente el
 * codigo de arranque para las pocas direcciones con evidencia real verificada.
 */
function toEcuSource(value: string): 'web' | 'mechanic' | 'seed' {
  if (value !== 'web' && value !== 'mechanic' && value !== 'seed') {
    throw new EcuDefinitionError(`Invalid ECU source: "${value}"`)
  }
  return value
}

/**
 * Definicion de una ECU aprendida en el catalogo auto-expansivo (ADR-007, opcion B).
 *
 * Identifica univocamente la tupla `(manufacturer, model, responseAddr)` y guarda
 * `name`/`type`/`system`/`confidence`/`source` aprendidos. Las direcciones CAN se
 * normalizan a mayusculas. A diferencia de PIDs y DTCs, no admite validacion OBD:
 * la confianza sale unicamente de la fuente (`web` 0.3 / `mechanic` 0.8 / `seed` 0.9,
 * esta ultima para las pocas direcciones sembradas con evidencia real verificada).
 */
export class EcuDefinition {
  readonly id: number
  readonly manufacturer: string
  readonly model: string
  readonly responseAddr: string
  readonly requestAddr: string
  readonly name: string
  readonly type: string
  readonly system?: string
  readonly confidence: number
  readonly source: 'web' | 'mechanic' | 'seed'
  readonly createdAt?: string

  /**
   * @param params - Propiedades de la definicion de ECU.
   * @throws {EcuDefinitionError} Si `name` esta vacio, las direcciones no son
   *   hexadecimales, `confidence` esta fuera del rango [0, 1], o `source` no
   *   es `'web'`, `'mechanic'` ni `'seed'`.
   */
  constructor(params: {
    id: number
    manufacturer: string
    model: string
    responseAddr: string
    requestAddr: string
    name: string
    type: string
    system?: string
    confidence: number
    source: string
    createdAt?: string
  }) {
    if (!params.name.trim()) throw new EcuDefinitionError('ECU name must not be empty')
    if (!CAN_ADDR_REGEX.test(params.responseAddr.trim())) {
      throw new EcuDefinitionError(`Invalid CAN response address: "${params.responseAddr}"`)
    }
    if (!CAN_ADDR_REGEX.test(params.requestAddr.trim())) {
      throw new EcuDefinitionError(`Invalid CAN request address: "${params.requestAddr}"`)
    }
    if (params.confidence < 0 || params.confidence > 1) {
      throw new EcuDefinitionError(`confidence must be between 0 and 1, got ${params.confidence}`)
    }
    const source = toEcuSource(params.source)
    this.id = params.id
    this.manufacturer = params.manufacturer
    this.model = params.model
    this.responseAddr = params.responseAddr.trim().toUpperCase()
    this.requestAddr = params.requestAddr.trim().toUpperCase()
    this.name = params.name.trim()
    this.type = params.type
    this.system = params.system
    this.confidence = params.confidence
    this.source = source
    this.createdAt = params.createdAt
  }
}
