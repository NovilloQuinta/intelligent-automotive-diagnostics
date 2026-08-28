/** Error lanzado cuando falla el parseo o evaluación de una fórmula de PID. */
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

/** Parentesis y operadores que ocupan un solo caracter. */
const SINGLE_CHAR_TOKENS = new Set(['(', ')', '+', '-', '*', '/', '|', '&'])

/**
 * Lo que un lector consume del inicio de la formula: cuantos caracteres avanza y,
 * si procede, el token que emite. El espacio en blanco avanza sin emitir nada.
 */
type TokenRead = { readonly length: number; readonly token?: string }

/** Reconoce un token al principio de `rest`, o devuelve `null` si no le toca a el. */
type TokenReader = (rest: string, position: number) => TokenRead | null

/**
 * Los lectores, en el orden en que se prueban.
 *
 * El orden importa en un sitio: los operadores de dos caracteres van antes que los de
 * uno, para que `<<` no se lea como dos `<` sueltos.
 *
 * Esta tabla sustituye a la escalera de `if`s que tenia `tokenize`, que llegaba a
 * complejidad 23 por contar cada rama. Cada lector es una regla de una linea y se
 * prueba sola; anadir un operador es anadir una fila, no otra rama.
 */
const TOKEN_READERS: readonly TokenReader[] = [
  (rest) => (/^\s/.test(rest) ? { length: 1 } : null),
  (rest) => {
    const two = rest.slice(0, 2)
    return two === '<<' || two === '>>' ? { length: 2, token: two } : null
  },
  (rest) => (SINGLE_CHAR_TOKENS.has(rest[0]) ? { length: 1, token: rest[0] } : null),
  // Los bytes de la trama se nombran A..H y se normalizan a mayuscula.
  (rest) => (/^[A-Ha-h]/.test(rest) ? { length: 1, token: rest[0].toUpperCase() } : null),
  // `raw` es el unico identificador de mas de una letra. Una `r` que no lo forme es un
  // error propio: decir "caracter invalido" a secas mandaria a buscar al sitio equivocado.
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

/** El menos unario liga mas fuerte que cualquier operador binario. */
const UNARY_PRECEDENCE = 99

/** Los tokens que van directos a la salida: numero literal, `raw` o un byte A..H. */
function isOperand(token: string): boolean {
  return /^[0-9.]+$/.test(token) || token === 'raw' || /^[A-H]$/.test(token)
}

/** Posicion en la que un `+`/`-` solo puede ser signo: no hay nada a la izquierda que sumar. */
function startsExpression(previous: string | undefined): boolean {
  return previous === undefined || isOpOrParen(previous)
}

/**
 * Un `+` o un `-` al principio de la formula o justo detras de otro operador es un
 * signo, no una suma o una resta: el `-` pasa a `u` (menos unario) y el `+` se descarta
 * porque no hace nada. `null` significa "descarta este token".
 */
function normalizeSign(token: string, previous: string | undefined): string | null {
  if (token === '-') return startsExpression(previous) ? 'u' : token
  if (token === '+') return startsExpression(previous) ? null : token
  return token
}

/** Vuelca operadores hasta el parentesis de apertura, que se descarta. */
function closeParen(ops: string[], output: string[]): void {
  while (ops.length > 0 && ops[ops.length - 1] !== '(') output.push(ops.pop()!)
  if (ops.length === 0) throw new PidParseError('Unmatched closing parenthesis')
  ops.pop()
}

/** True mientras la cima de la pila deba salir antes que un operador de esta precedencia. */
function topOutranks(ops: string[], precedence: number): boolean {
  if (ops.length === 0) return false
  const top = ops[ops.length - 1]
  return top !== '(' && (PRECEDENCE[top] ?? 0) >= precedence
}

/** Apila un operador tras volcar los de precedencia mayor o igual que ya estaban. */
function pushOperator(token: string, ops: string[], output: string[]): void {
  const precedence = token === 'u' ? UNARY_PRECEDENCE : (PRECEDENCE[token] ?? -1)
  if (precedence < 0) throw new PidParseError(`Unknown operator: ${token}`)

  while (topOutranks(ops, precedence)) output.push(ops.pop()!)
  ops.push(token)
}

/** Vacia la pila al terminar: un parentesis vivo aqui es uno que nadie cerro. */
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

/**
 * Que hace cada operador binario. Sustituye al `switch` de ocho ramas que vivia dentro
 * de `evaluatePostfix` y era el grueso de su complejidad de 20.
 */
const BINARY_APPLY: Record<string, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => {
    if (b === 0) throw new PidParseError('Division by zero')
    return a / b
  },
  // `>>> 0` devuelve el resultado al rango sin signo: `|` opera en 32 bits con signo.
  '|': (a, b) => (a | b) >>> 0,
  '&': (a, b) => a & b,
  '<<': (a, b) => a << b,
  '>>': (a, b) => a >> b,
}

/** Valor de un operando, o `null` si el token no lo es. */
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

/** Valida la sintaxis de una formula (caracteres, parentesis, operadores) sin evaluar aritmetica.
 * @param formula — Expresion a validar
 * @throws PidParseError si la sintaxis es invalida
 */
export function validateFormulaSyntax(formula: string): void {
  if (formula.trim().length === 0) throw new PidParseError('Empty formula')
  const tokens = tokenize(formula)
  if (tokens.length === 0) throw new PidParseError('Empty formula')
  toPostfix(tokens)
}

/** Evalua una formula de PID OBD-II (SAE J1979).
 * @param formula — expresion como `(A*256+B)/4`, `A-40`
 * @param bytes — bytes de la respuesta OBD
 * @returns Valor fisico calculado
 * @throws PidParseError si la formula es invalida o hay division por cero
 */
export function evaluatePid(formula: string, bytes: number[]): number {
  if (formula.trim().length === 0) throw new PidParseError('Empty formula')
  const tokens = tokenize(formula)
  if (tokens.length === 0) throw new PidParseError('Empty formula')
  const postfix = toPostfix(tokens)
  return evaluatePostfix(postfix, bytes)
}

/** Int big-endian de todos los bytes (fallback para PIDs sin fórmula conocida). */
export function bigEndian(bytes: number[]): number {
  return bytes.reduce((acc, b) => acc * 256 + b, 0)
}
