import type { User } from '@/domain/entities/User.js'
import type { TokenPair } from '@/application/dto/auth/TokenPair.js'

export interface RegisterUserOutput extends TokenPair {
  readonly user: Omit<User, 'passwordHash'>
}
