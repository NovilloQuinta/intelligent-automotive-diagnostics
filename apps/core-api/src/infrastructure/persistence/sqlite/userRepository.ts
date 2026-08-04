import { eq } from 'drizzle-orm'
import * as schema from './schema.js'
import type { DiagnosticsDb } from './db.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import { User } from '@/domain/entities/user.js'
import type { CreateUserInput } from '@/application/dto/CreateUserInput.js'
import { Email } from '@/domain/value-objects/email.js'

type UserRow = typeof schema.users.$inferSelect

/** Implementacion de {@link UserRepository} con SQLite via Drizzle ORM. */
export class SqliteUserRepository implements UserRepository {
  constructor(private readonly db: DiagnosticsDb) {}

  private toUser(row: UserRow): User {
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
    })
  }

  async create(input: CreateUserInput): Promise<User> {
    const result = await this.db
      .insert(schema.users)
      .values({
        username: input.username,
        email: input.email.value,
        passwordHash: input.passwordHash,
        userType: input.userType,
        businessName: input.businessName ?? null,
        taxId: input.taxId ?? null,
        address: input.address ?? null,
        createdAt: new Date().toISOString(),
      })
      .returning()

    return this.toUser(result[0])
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email.toLowerCase().trim()))
      .limit(1)

    return rows.length === 0 ? null : this.toUser(rows[0])
  }

  async findById(id: number): Promise<User | null> {
    const rows = await this.db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1)

    return rows.length === 0 ? null : this.toUser(rows[0])
  }
}
