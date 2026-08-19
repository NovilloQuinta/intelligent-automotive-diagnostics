import type { User } from '@/domain/entities/User.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'

/** Output del caso de uso RegisterUser. */
export interface RegisterUserOutput extends TokenPair {
  readonly user: Omit<User, 'passwordHash'>
}
