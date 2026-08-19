import { Email } from '../value-objects/Email.js'

/** Error lanzado cuando falla la validacion de un User. */
export class UserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserError'
  }
}

/** Entidad que representa un usuario de la aplicacion (particular o taller). */
export class User {
  readonly id: number
  readonly username: string
  readonly email: Email
  readonly passwordHash: string
  readonly userType: 'individual' | 'workshop'
  readonly role: 'user' | 'admin'
  readonly businessName?: string | null
  readonly taxId?: string | null
  readonly address?: string | null
  readonly createdAt: string
  readonly failedLoginAttempts: number
  readonly lockedUntil: string | null

  constructor(params: {
    id: number
    username: string
    email: Email
    passwordHash: string
    userType: 'individual' | 'workshop'
    role?: 'user' | 'admin'
    businessName?: string | null
    taxId?: string | null
    address?: string | null
    createdAt: string
    failedLoginAttempts?: number
    lockedUntil?: string | null
  }) {
    if (!params.username.trim() || params.username.trim().length < 3)
      throw new UserError('username must be at least 3 characters')
    if (!params.passwordHash) throw new UserError('passwordHash must not be empty')
    this.id = params.id
    this.username = params.username.trim()
    this.email = params.email
    this.passwordHash = params.passwordHash
    this.userType = params.userType
    this.role = params.role ?? 'user'
    this.businessName = params.businessName
    this.taxId = params.taxId
    this.address = params.address
    this.createdAt = params.createdAt
    this.failedLoginAttempts = params.failedLoginAttempts ?? 0
    this.lockedUntil = params.lockedUntil ?? null
  }

  /** Indica si el usuario es un taller. */
  get isWorkshop(): boolean {
    return this.userType === 'workshop'
  }

  /** Indica si el usuario tiene privilegios de administrador. */
  get isAdmin(): boolean {
    return this.role === 'admin'
  }
}
