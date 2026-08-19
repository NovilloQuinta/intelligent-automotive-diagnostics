import { evaluatePid, validateFormulaSyntax } from '../services/pidFormula.js'

/** Value Object que representa una formula de PID OBD-II validada sintacticamente. */
export class Formula {
  readonly expression: string

  /** @param expression — Expresion de formula (ej. `'A-40'`, `'(A*256+B)/4'`)
   * @throws PidParseError si la expresion es vacia o tiene sintaxis invalida
   */
  constructor(expression: string) {
    validateFormulaSyntax(expression)
    this.expression = expression
  }

  /** Evalua la formula con los bytes de respuesta OBD.
   * @param bytes — Array de bytes de la respuesta OBD
   * @returns Valor fisico calculado
   * @throws PidParseError si los bytes son insuficientes
   */
  evaluate(bytes: number[]): number {
    return evaluatePid(this.expression, bytes)
  }

  toString(): string {
    return this.expression
  }
}
