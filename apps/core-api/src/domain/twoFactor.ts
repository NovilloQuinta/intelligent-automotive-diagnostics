import { randomInt } from 'node:crypto'

/**
 * Reglas del segundo factor TOTP (RFC 6238).
 *
 * Viven en el dominio, no en el adaptador, porque son decisiones del producto y no
 * detalles de la libreria que las implementa: cambiar de libreria no debe poder
 * cambiar en silencio cuantos digitos pide la pantalla ni cuanto dura un codigo.
 */

/** Digitos del codigo. Seis es lo que asumen todas las apps autenticadoras. */
export const TOTP_DIGITS = 6

/** Duracion de cada codigo, en segundos. */
export const TOTP_PERIOD_SECONDS = 30

/** Algoritmo HMAC. SHA-1 aqui no es una debilidad: es lo que el estandar fijo y lo unico que leen las apps. */
export const TOTP_ALGORITHM = 'SHA1'

/**
 * Pasos de desfase admitidos a cada lado del actual.
 *
 * Uno da 30 s de margen por delante y por detras. Cubre el reloj del servidor
 * ligeramente desviado y al usuario que teclea justo al cambiar el codigo, sin
 * ampliar la ventana de un codigo robado mas de lo necesario.
 */
export const TOTP_WINDOW_STEPS = 1

/** Codigos de recuperacion que se entregan al activar el segundo factor. */
export const RECOVERY_CODE_COUNT = 10

/** Caracteres por bloque de un codigo de recuperacion. */
const RECOVERY_BLOCK_LENGTH = 4

/**
 * Alfabeto de los codigos de recuperacion.
 *
 * Sin `O`, `0`, `I`, `1` ni `L`: son codigos que la gente copia a mano de un papel,
 * y confundirlos genera tickets de soporte, no seguridad. Quedan 31 simbolos, asi
 * que ocho caracteres dan ~39 bits por codigo, de sobra para un secreto de un solo uso.
 */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** Longitud de un codigo de recuperacion ya normalizado (sin el guion). */
const RECOVERY_CODE_LENGTH = RECOVERY_BLOCK_LENGTH * 2

/** Datos que identifican la cuenta dentro de la app autenticadora. */
export interface OtpauthUriParams {
  /** Nombre del servicio tal y como lo vera el usuario en su app. */
  readonly issuer: string
  /** Identificador de la cuenta, normalmente el email. */
  readonly account: string
  /** Secreto compartido, en Base32. */
  readonly secret: string
}

/**
 * Construye la URI `otpauth://` que se convierte en codigo QR.
 *
 * El formato lo fija la especificacion de Key Uri de Google, que es la que leen
 * todas las apps. La etiqueta va como `emisor:cuenta` y ademas repetida en el
 * parametro `issuer`, porque las apps antiguas solo miran una de las dos.
 */
export function buildOtpauthUri({ issuer, account, secret }: OtpauthUriParams): string {
  const label = encodeURIComponent(`${issuer}:${account}`)
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: TOTP_ALGORITHM,
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  })
  return `otpauth://totp/${label}?${params.toString()}`
}

/** Devuelve un bloque aleatorio del alfabeto de recuperacion. */
function randomBlock(): string {
  let block = ''
  for (let i = 0; i < RECOVERY_BLOCK_LENGTH; i += 1) {
    block += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]
  }
  return block
}

/**
 * Genera el lote de codigos de recuperacion, sin repetidos.
 *
 * Son la unica via de vuelta si el usuario pierde el dispositivo: sin ellos,
 * activar el segundo factor cambiaria "me pueden robar la cuenta" por "puedo
 * perderla yo". Se entregan una sola vez y se guardan hasheados.
 */
export function generateRecoveryCodes(): string[] {
  const codes = new Set<string>()
  while (codes.size < RECOVERY_CODE_COUNT) {
    codes.add(`${randomBlock()}-${randomBlock()}`)
  }
  return [...codes]
}

/**
 * Normaliza lo que el usuario teclea antes de compararlo.
 *
 * Las apps muestran `123 456` y los codigos de recuperacion llevan guion; ninguna
 * de las dos cosas es parte del secreto. Sin esto, un pegado literal falla y el
 * usuario cree que el codigo es incorrecto.
 */
export function normalizeTwoFactorCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase()
}

/**
 * Indica si un codigo ya normalizado tiene forma de codigo de recuperacion.
 *
 * Sirve para decidir contra que se compara, no para validar: un TOTP son seis
 * digitos y uno de recuperacion ocho caracteres del alfabeto, asi que no se
 * solapan.
 */
export function isRecoveryCodeShaped(normalizedCode: string): boolean {
  if (normalizedCode.length !== RECOVERY_CODE_LENGTH) return false
  return [...normalizedCode].every((char) => RECOVERY_ALPHABET.includes(char))
}
