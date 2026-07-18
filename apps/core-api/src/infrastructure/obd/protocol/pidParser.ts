/** Error lanzado cuando falla el parseo o evaluación de una fórmula de PID. */
export class PidParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidParseError'
  }
}

/** Precedencia de operadores (menor número = menor precedencia). */
const PRECEDENCE: Record<string, number> = {
  '|': 1,
  '&': 2,
  '<<': 3,
  '>>': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  'u': 6, // unary minus (right-associative en la práctica)
}

const BINARY_OPS = new Set(Object.keys(PRECEDENCE))

/** Tokens que son operadores o paréntesis. */
function isOpOrParen(t: string): boolean {
  return BINARY_OPS.has(t) || t === '('
}

/** Convierte una fórmula a array de tokens. */
function tokenize(formula: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < formula.length) {
    const ch = formula[i]
    if (/\s/.test(ch)) { i++; continue }
    if (ch === '(' || ch === ')') { tokens.push(ch); i++; continue }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '|' || ch === '&') {
      tokens.push(ch); i++; continue
    }
    if (ch === '<' && formula[i + 1] === '<') { tokens.push('<<'); i += 2; continue }
    if (ch === '>' && formula[i + 1] === '>') { tokens.push('>>'); i += 2; continue }
    if (/[A-Ha-h]/.test(ch)) { tokens.push(ch.toUpperCase()); i++; continue }
    if (ch === 'r' || ch === 'R') {
      if (formula.slice(i, i + 3).toLowerCase() === 'raw') { tokens.push('raw'); i += 3; continue }
      throw new PidParseError(`Unknown token starting with 'r' at position ${i}`)
    }
    if (/[0-9.]/.test(ch)) {
      let num = ''
      while (i < formula.length && /[0-9.]/.test(formula[i])) { num += formula[i]; i++ }
      const val = Number.parseFloat(num)
      if (Number.isNaN(val)) throw new PidParseError(`Invalid number: ${num}`)
      tokens.push(num)
      continue
    }
    throw new PidParseError(`Invalid character '${ch}' at position ${i}`)
  }

  return tokens
}

/** Convierte tokens infijos a notación postfija (Shunting-yard de Dijkstra). */
function toPostfix(infixTokens: string[]): string[] {
  const output: string[] = []
  const ops: string[] = []

  for (let i = 0; i < infixTokens.length; i++) {
    let token = infixTokens[i]

    // Unario + o -
    if ((token === '+' || token === '-') && (i === 0 || isOpOrParen(infixTokens[i - 1]))) {
      token = token === '-' ? 'u' : token
      if (token === '+') continue // unario + es no-op
      // unario - se marca como 'u'
    }

    if (/^[0-9.]+$/.test(token) || token === 'raw' || /^[A-H]$/.test(token)) {
      output.push(token)
    } else if (token === '(') {
      ops.push(token)
    } else if (token === ')') {
      while (ops.length > 0 && ops[ops.length - 1] !== '(') {
        output.push(ops.pop()!)
      }
      if (ops.length === 0) throw new PidParseError('Unmatched closing parenthesis')
      ops.pop() // sacar '('
    } else {
      // Operador binario o unario
      const prec = token === 'u' ? 99 : (PRECEDENCE[token] ?? -1)
      if (prec < 0) throw new PidParseError(`Unknown operator: ${token}`)

      while (
        ops.length > 0 &&
        ops[ops.length - 1] !== '(' &&
        (PRECEDENCE[ops[ops.length - 1]] ?? 0) >= prec
      ) {
        output.push(ops.pop()!)
      }
      ops.push(token)
    }
  }

  while (ops.length > 0) {
    const op = ops.pop()!
    if (op === '(') throw new PidParseError('Unmatched opening parenthesis')
    output.push(op)
  }

  return output
}

/** Computa el valor de `raw` (bytes concatenados como big-endian integer). */
function computeRaw(bytes: number[]): number {
  let result = 0
  for (const b of bytes) result = (result << 8) | b
  return result
}

/** Evalúa una expresión en notación postfija con los bytes crudos. */
function evaluatePostfix(postfix: string[], bytes: number[]): number {
  const stack: number[] = []

  for (const token of postfix) {
    if (/^[0-9.]+$/.test(token)) {
      stack.push(Number.parseFloat(token))
    } else if (token === 'raw') {
      stack.push(computeRaw(bytes))
    } else if (/^[A-H]$/.test(token)) {
      const idx = token.charCodeAt(0) - 'A'.charCodeAt(0)
      if (idx >= bytes.length) {
        throw new PidParseError(`Variable ${token} requires byte index ${idx} but only ${bytes.length} bytes provided`)
      }
      stack.push(bytes[idx])
    } else if (token === 'u') {
      if (stack.length < 1) throw new PidParseError('Missing operand for unary minus')
      stack.push(-stack.pop()!)
    } else if (BINARY_OPS.has(token)) {
      if (stack.length < 2) throw new PidParseError(`Missing operands for ${token}`)
      const b = stack.pop()!
      const a = stack.pop()!
      switch (token) {
        case '+': stack.push(a + b); break
        case '-': stack.push(a - b); break
        case '*': stack.push(a * b); break
        case '/':
          if (b === 0) throw new PidParseError('Division by zero')
          stack.push(a / b)
          break
        case '|': stack.push((a | b) >>> 0); break
        case '&': stack.push(a & b); break
        case '<<': stack.push(a << b); break
        case '>>': stack.push(a >> b); break
      }
    } else {
      throw new PidParseError(`Unknown token in postfix: ${token}`)
    }
  }

  if (stack.length !== 1) throw new PidParseError(`Invalid expression: stack has ${stack.length} values`)
  return stack[0]
}

/** Evalúa una fórmula de PID OBD-II según notación SAE J1979 usando Shunting-yard.
 * @param formula — expresión como `(A*256+B)/4`, `A-40`, `A<<16|B<<8|C`
 * @param bytes — bytes de la respuesta OBD
 * @returns Valor físico calculado
 * @throws PidParseError — si la fórmula es inválida o hay división por cero
 */
export function evaluatePid(formula: string, bytes: number[]): number {
  if (formula.trim().length === 0) throw new PidParseError('Empty formula')
  const tokens = tokenize(formula)
  if (tokens.length === 0) throw new PidParseError('Empty formula')
  const postfix = toPostfix(tokens)
  return evaluatePostfix(postfix, bytes)
}
