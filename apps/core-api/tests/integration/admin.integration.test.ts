import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { vi } from 'vitest'
import { createServer } from '@/infrastructure/http/server.js'
import { createAdminController } from '@/infrastructure/composition/composition.js'
import { createRequireAdmin } from '@/infrastructure/http/middleware/admin.middleware.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteLogRepository } from '@/infrastructure/persistence/sqlite/logRepository.js'
import { SqliteAuditLogRepository } from '@/infrastructure/persistence/sqlite/auditLogRepository.js'
import { SqliteRefreshTokenStore } from '@/infrastructure/persistence/sqlite/refreshTokenStore.js'
import { createAuthService } from '@/infrastructure/services/authService.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import { Email } from '@/domain/value-objects/email.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { KnowledgeStackWithStores } from '@/infrastructure/composition/composition.js'
import type { VectorStore } from '@/application/ports/VectorStore.js'
import type { VectorRepository } from '@/application/ports/VectorRepository.js'

const ACCESS_SECRET = 'admin-integration-access-secret'
const REFRESH_SECRET = 'admin-integration-refresh-secret'

/** Almacen vectorial de prueba: sin LanceDB real, solo lo que necesitan los tests. */
function fakeVectorStore(count: number, sample: Record<string, unknown>[] = []): VectorStore {
  return {
    upsert: vi.fn(),
    query: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(count),
    sample: vi.fn().mockResolvedValue(sample),
  }
}

/** Indice de conocimiento de prueba: solo `search`, que es lo que usa el endpoint. */
function fakeIndex(
  results: readonly { entry: unknown; distance: number }[] = [],
): VectorRepository<unknown> {
  return { index: vi.fn(), search: vi.fn().mockResolvedValue(results) }
}

describe('Admin integration', () => {
  let app: ReturnType<typeof createServer>
  let normalToken: string
  let adminToken: string

  beforeAll(async () => {
    const sqlite = new Database(':memory:')
    sqlite.pragma('foreign_keys = ON')
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        user_type TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        business_name TEXT,
        tax_id TEXT,
        address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT
      );
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        context TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        method TEXT NOT NULL,
        path TEXT NOT NULL,
        status_code INTEGER NOT NULL,
        ip TEXT,
        user_agent TEXT,
        duration_ms INTEGER,
        user_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `)

    const db = drizzle(sqlite)
    const userRepo = new SqliteUserRepository(db)
    const logRepo = new SqliteLogRepository(db)
    const auditRepo = new SqliteAuditLogRepository(db)
    const tokenStore = new SqliteRefreshTokenStore(db)
    const authService = createAuthService({
      accessTokenSecret: ACCESS_SECRET,
      refreshTokenSecret: REFRESH_SECRET,
      accessTokenExpiresIn: '15m',
      refreshTokenExpiresIn: '7d',
      tokenStore,
    })

    const authController = new AuthController({
      registerUser: new RegisterUserUseCase(userRepo, authService, tokenStore),
      loginUser: new LoginUserUseCase(userRepo, authService, tokenStore),
      refreshToken: new RefreshTokenUseCase(authService),
      getCurrentUser: new GetCurrentUserUseCase(userRepo),
      logoutUser: new LogoutUserUseCase(tokenStore),
    })

    const normalUser = await userRepo.create({
      username: 'juan',
      email: new Email('juan@test.com'),
      passwordHash: await authService.hashPassword('Pass1234!'),
      userType: 'individual',
    })
    const adminUser = await userRepo.create({
      username: 'admin',
      email: new Email('admin@test.com'),
      passwordHash: await authService.hashPassword('AdminPass123!'),
      userType: 'individual',
      role: 'admin',
    })
    normalToken = authService.generateTokens(normalUser.id).accessToken
    adminToken = authService.generateTokens(adminUser.id).accessToken

    // Datos de fondo para que overview/logs/audit-logs devuelvan algo no vacio.
    await auditRepo.create({ method: 'GET', path: '/api/diagnosis', statusCode: 200, userId: 1 })
    await auditRepo.create({ method: 'GET', path: '/api/diagnosis', statusCode: 500, userId: 1 })

    const knowledgeStack: KnowledgeStackWithStores = {
      pidsIndex: fakeIndex([{ entry: { id: 'pid-1' }, distance: 0.1 }]),
      dtcsIndex: fakeIndex(),
      diagnosisIndex: fakeIndex(),
      vectorStores: {
        pids: fakeVectorStore(10, [{ id: 'pid-1' }]),
        dtcs: fakeVectorStore(5, [{ id: 'dtc-1' }]),
        diagnoses: fakeVectorStore(2, [{ id: 'diag-1' }]),
      },
    }

    const adminController = createAdminController({ userRepo, logRepo, auditRepo }, knowledgeStack)

    const mockAuditRepo: AuditLogRepository = auditRepo
    const mockLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} }

    app = createServer({
      diagnosisController: new DiagnosisController(
        new DiagnosisService({ scenarios: [], logger: mockLogger }),
        mockLogger,
      ),
      rateLimit: { windowMinutes: 60, maxRequests: 1000 },
      adminRateLimit: { windowMinutes: 60, maxRequests: 1000 },
      authController,
      adminController,
      requireAdmin: createRequireAdmin(userRepo),
      accessTokenSecret: ACCESS_SECRET,
      allowedOrigins: '*',
      nodeEnv: 'test',
      auditRepo: mockAuditRepo,
      logger: mockLogger,
    })
  })

  const endpoints: { method: 'get' | 'post'; path: string }[] = [
    { method: 'get', path: '/api/admin/overview' },
    { method: 'get', path: '/api/admin/logs' },
    { method: 'get', path: '/api/admin/audit-logs' },
    { method: 'get', path: '/api/admin/users' },
    { method: 'get', path: '/api/admin/knowledge' },
    { method: 'post', path: '/api/admin/knowledge/search' },
  ]

  describe('access control', () => {
    for (const { method, path } of endpoints) {
      it(`${method.toUpperCase()} ${path} should return 401 without a token`, async () => {
        await request(app)[method](path).expect(401)
      })

      it(`${method.toUpperCase()} ${path} should return 403 for a non-admin user`, async () => {
        await request(app)[method](path).set('Authorization', `Bearer ${normalToken}`).expect(403)
      })
    }
  })

  describe('GET /api/admin/overview', () => {
    it('should return 200 with the overview shape for an admin', async () => {
      const res = await request(app)
        .get('/api/admin/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.userStats).toHaveProperty('byUserType')
      expect(res.body.userStats).toHaveProperty('byRole')
      expect(typeof res.body.recentErrorCount).toBe('number')
      expect(res.body.httpRequestsByPathApprox).toEqual({ '/api/diagnosis': 2 })
    })
  })

  describe('GET /api/admin/logs', () => {
    it('should return 200 with a paginated shape', async () => {
      const res = await request(app)
        .get('/api/admin/logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(Array.isArray(res.body.items)).toBe(true)
      expect(typeof res.body.total).toBe('number')
    })

    it('should return 400 for an invalid level', async () => {
      await request(app)
        .get('/api/admin/logs?level=nope')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)
    })
  })

  describe('GET /api/admin/audit-logs', () => {
    it('should return 200 with the audit entries created above', async () => {
      const res = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.total).toBe(2)
    })

    it('should return 400 for an invalid statusCode', async () => {
      await request(app)
        .get('/api/admin/audit-logs?statusCode=abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400)
    })
  })

  describe('GET /api/admin/users', () => {
    it('should return users without passwordHash', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.total).toBe(2)
      for (const item of res.body.items) {
        expect(item).not.toHaveProperty('passwordHash')
      }
    })
  })

  describe('GET /api/admin/knowledge', () => {
    it('should return count and sample for the three indices', async () => {
      const res = await request(app)
        .get('/api/admin/knowledge')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(res.body.pids.count).toBe(10)
      expect(res.body.dtcs.count).toBe(5)
      expect(res.body.diagnoses.count).toBe(2)
    })
  })

  describe('POST /api/admin/knowledge/search', () => {
    it('should delegate on the real search flow and return its results', async () => {
      const res = await request(app)
        .post('/api/admin/knowledge/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: 'misfire', index: 'pids' })
        .expect(200)

      expect(res.body.results).toEqual([{ entry: { id: 'pid-1' }, distance: 0.1 }])
    })

    it('should return 400 for an unknown index', async () => {
      await request(app)
        .post('/api/admin/knowledge/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ text: 'misfire', index: 'unknown' })
        .expect(400)
    })
  })
})
