/**
 * Evaluador de formulas de PID OBD-II, portado de
 * `apps/core-api/src/domain/services/pidFormula.ts` para el cliente nativo.
 * Puerto verbatim del algoritmo (shunting-yard + evaluacion postfix).
 */

/** Error lanzado cuando falla el parseo o evaluacion de una formula de PID. */
export class PidParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PidParseError'
  }
}

const PRECEDENCE: Record<string, number> = {
  '|': 1,
  '&': 2,
  '<<': 3,
  '>>': 3,
  '+': 4,
  '-': 4,
  '*': 5,
  '/': 5,
  u: 6,
}

const BINARY_OPS = new Set(Object.keys(PRECEDENCE))

function isOpOrParen(t: string): boolean {
  return BINARY_OPS.has(t) || t === '('
}

const SINGLE_CHAR_TOKENS = new Set(['(', ')', '+', '-', '*', '/', '|', '&'])

type TokenRead = { readonly length: number; readonly token?: string }
type TokenReader = (rest: string, position: number) => TokenRead | null

const TOKEN_READERS: readonly TokenReader[] = [
  (rest) => (/^\s/.test(rest) ? { length: 1 } : null),
  (rest) => {
    const two = rest.slice(0, 2)
    return two === '<<' || two === '>>' ? { length: 2, token: two } : null
  },
  (rest) => (SINGLE_CHAR_TOKENS.has(rest[0]) ? { length: 1, token: rest[0] } : null),
  (rest) => (/^[A-Ha-h]/.test(rest) ? { length: 1, token: rest[0].toUpperCase() } : null),
  (rest, position) => {
    if (!/^[rR]/.test(rest)) return null
    if (rest.slice(0, 3).toLowerCase() === 'raw') return { length: 3, token: 'raw' }
    throw new PidParseError(`Unknown token starting with 'r' at position ${position}`)
  },
  (rest) => {
    const num = /^[0-9.]+/.exec(rest)?.[0]
    if (num === undefined) return null
    if (Number.isNaN(Number.parseFloat(num))) throw new PidParseError(`Invalid number: ${num}`)
    return { length: num.length, token: num }
  },
]

function tokenize(formula: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < formula.length) {
    const rest = formula.slice(i)
    const read = TOKEN_READERS.reduce<TokenRead | null>(
      (found, reader) => found ?? reader(rest, i),
      null,
    )
    if (read === null) {
      throw new PidParseError(`Invalid character '${formula[i]}' at position ${i}`)
    }
    if (read.token !== undefined) tokens.push(read.token)
    i += read.length
  }

  return tokens
}

const UNARY_PRECEDENCE = 99

function isOperand(token: string): boolean {
  return /^[0-9.]+$/.test(token) || token === 'raw' || /^[A-H]$/.test(token)
}

function startsExpression(previous: string | undefined): boolean {
  return previous === undefined || isOpOrParen(previous)
}

function normalizeSign(token: string, previous: string | undefined): string | null {
  if (token === '-') return startsExpression(previous) ? 'u' : token
  if (token === '+') return startsExpression(previous) ? null : token
  return token
}

function closeParen(ops: string[], output: string[]): void {
  while (ops.length > 0 && ops[ops.length - 1] !== '(') output.push(ops.pop()!)
  if (ops.length === 0) throw new PidParseError('Unmatched closing parenthesis')
  ops.pop()
}

function topOutranks(ops: string[], precedence: number): boolean {
  if (ops.length === 0) return false
  const top = ops[ops.length - 1]
  return top !== '(' && (PRECEDENCE[top] ?? 0) >= precedence
}

function pushOperator(token: string, ops: string[], output: string[]): void {
  const precedence = token === 'u' ? UNARY_PRECEDENCE : (PRECEDENCE[token] ?? -1)
  if (precedence < 0) throw new PidParseError(`Unknown operator: ${token}`)

  while (topOutranks(ops, precedence)) output.push(ops.pop()!)
  ops.push(token)
}

function drainRemaining(ops: string[], output: string[]): void {
  while (ops.length > 0) {
    const op = ops.pop()!
    if (op === '(') throw new PidParseError('Unmatched opening parenthesis')
    output.push(op)
  }
}

function toPostfix(infixTokens: string[]): string[] {
  const output: string[] = []
  const ops: string[] = []

  for (let i = 0; i < infixTokens.length; i++) {
    const token = normalizeSign(infixTokens[i], i === 0 ? undefined : infixTokens[i - 1])
    if (token === null) continue

    if (isOperand(token)) output.push(token)
    else if (token === '(') ops.push(token)
    else if (token === ')') closeParen(ops, output)
    else pushOperator(token, ops, output)
  }

  drainRemaining(ops, output)

  return output
}

function computeRaw(bytes: number[]): number {
  let result = 0
  for (const b of bytes) result = (result << 8) | b
  return result
}

const BINARY_APPLY: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => {
    if (b === 0) throw new PidParseError('Division by zero')
    return a / b
  },
  '|': (a, b) => (a | b) >>> 0,
  '&': (a, b) => a & b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
}

function resolveOperand(token: string, bytes: number[]): number | null {
  if (/^[0-9.]+$/.test(token)) return Number.parseFloat(token)
  if (token === 'raw') return computeRaw(bytes)
  if (!/^[A-H]$/.test(token)) return null

  const index = token.charCodeAt(0) - 'A'.charCodeAt(0)
  if (index >= bytes.length) {
    throw new PidParseError(
      `Variable ${token} requires byte index ${index} but only ${bytes.length} bytes provided`,
    )
  }
  return bytes[index]
}

function evaluatePostfix(postfix: string[], bytes: number[]): number {
  const stack: number[] = []

  for (const token of postfix) {
    const operand = resolveOperand(token, bytes)
    if (operand !== null) {
      stack.push(operand)
      continue
    }

    if (token === 'u') {
      if (stack.length < 1) throw new PidParseError('Missing operand for unary minus')
      stack.push(-stack.pop()!)
      continue
    }

    const apply = BINARY_APPLY[token]
    if (apply === undefined) throw new PidParseError(`Unknown token in postfix: ${token}`)
    if (stack.length < 2) throw new PidParseError(`Missing operands for ${token}`)

    const b = stack.pop()!
    const a = stack.pop()!
    stack.push(apply(a, b))
  }

  if (stack.length !== 1)
    throw new PidParseError(`Invalid expression: stack has ${stack.length} values`)
  return stack[0]
}

/** Evalua una formula de PID OBD-II (SAE J1979), ej. `(A*256+B)/4`, `A-40`. */
export function evaluatePid(formula: string, bytes: number[]): number {
  if (formula.trim().length === 0) throw new PidParseError('Empty formula')
  const tokens = tokenize(formula)
  if (tokens.length === 0) throw new PidParseError('Empty formula')
  const postfix = toPostfix(tokens)
  return evaluatePostfix(postfix, bytes)
}

/** Int big-endian de todos los bytes (fallback para PIDs sin formula conocida). */
export function bigEndian(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc * 256 + b, 0)
}
