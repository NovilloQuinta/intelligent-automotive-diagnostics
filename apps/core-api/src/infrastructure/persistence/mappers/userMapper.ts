import type * as schema from '../sqlite/schema.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/auth/CreateUserInput.js'
import { Email } from '@/domain/value-objects/email.js'

type UserRow = typeof schema.users.$inferSelect

/** Convierte una fila de BD a la entidad User del dominio. */
export function toUser(row: UserRow): User {
  return new User({
    id: row.id,
    username: row.username,
    email: new Email(row.email),
    passwordHash: row.passwordHash,
    userType: row.userType as 'individual' | 'workshop',
    businessName: row.businessName,
    taxId: row.taxId,
    address: row.address,
    createdAt: row.createdAt,
    failedLoginAttempts: row.failedLoginAttempts,
    lockedUntil: row.lockedUntil,
  })
}

/** Convierte un CreateUserInput a los valores para INSERT en BD. */
export function toCreateValues(input: CreateUserInput) {
  return {
    username: input.username,
    email: input.email.value,
    passwordHash: input.passwordHash,
    userType: input.userType,
    businessName: input.businessName ?? null,
    taxId: input.taxId ?? null,
    address: input.address ?? null,
    createdAt: new Date().toISOString(),
  }
}
