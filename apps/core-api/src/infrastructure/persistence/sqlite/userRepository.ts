import { eq } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/CreateUserInput.js'
import { toUser, toCreateValues } from '@/infrastructure/persistence/mappers/userMapper.js'

/** Implementacion de {@link UserRepository} con SQLite via Drizzle ORM. */
export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db.insert(schema.users).values(toCreateValues(input)).returning()

    return toUser(result[0])
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1)

    return rows.length === 0 ? null : toUser(rows[0])
  }

  async findById(id: number): Promise<User | null> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)

    return rows.length === 0 ? null : toUser(rows[0])
  }
}
