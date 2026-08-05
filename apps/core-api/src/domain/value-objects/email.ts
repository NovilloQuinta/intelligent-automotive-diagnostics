/** Error lanzado cuando falla la validacion de un Email. */
export class EmailError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EmailError'
  }
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Value Object que representa una direccion de correo electronico validada. */
export class Email {
  readonly value: string

  constructor(value: string) {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed || !EMAIL_REGEX.test(trimmed)) {
      throw new EmailError(`Invalid email: "${value}"`)
    }
    this.value = trimmed
  }

  toString(): string {
    return this.value
  }

  /** Permite que JSON.stringify serialice el email como string. */
  toJSON(): string {
    return this.value
  }
}
