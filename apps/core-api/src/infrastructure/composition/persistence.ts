import { getDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { SqlitePasswordResetTokenRepository } from '@/infrastructure/persistence/sqlite/passwordResetTokenRepository.js'
import { SqliteLogRepository } from '@/infrastructure/persistence/sqlite/logRepository.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Composicion de la capa de persistencia: una conexion SQLite y sus repositorios. */

/** Los repositorios SQLite de la aplicacion, todos sobre la misma conexion. */
export interface PersistenceRepositories {
  readonly db: ReturnType<typeof getDb>
  readonly auditRepo: SqliteAuditLogRepository
  readonly userRepo: SqliteUserRepository
  readonly tokenStore: SqliteRefreshTokenStore
  readonly passwordResetTokenRepo: SqlitePasswordResetTokenRepository
  readonly logRepo: SqliteLogRepository
}

/** Crea los repositorios SQLite y devuelve la conexion compartida. */
export function createPersistenceRepositories(config: AppConfig): PersistenceRepositories {
  const db = getDb(config.DB_PATH)
  return {
    db,
    auditRepo: new SqliteAuditLogRepository(db),
    userRepo: new SqliteUserRepository(db),
    tokenStore: new SqliteRefreshTokenStore(db),
    passwordResetTokenRepo: new SqlitePasswordResetTokenRepository(db),
    logRepo: new SqliteLogRepository(db),
  }
}
