import type { Application } from 'express'
import { createDiagnosisService } from '@/infrastructure/composition/diagnosis.js'
import { createPersistenceRepositories } from '@/infrastructure/composition/persistence.js'
import type { PersistenceRepositories } from '@/infrastructure/composition/persistence.js'
import { createEmailSender } from '@/infrastructure/composition/email.js'
import { createLlmClient, createWebSearchPort } from '@/infrastructure/composition/llm.js'
import { createKnowledgeStack } from '@/infrastructure/composition/knowledge.js'
import {
  createAuthStack,
  createAuthController,
  createProfileStack,
  seedAdminUser,
} from '@/infrastructure/composition/auth.js'
import { createAdminController } from '@/infrastructure/composition/admin.js'
import { createServer } from '@/infrastructure/http/server.js'
import { SqliteUserRepository } from '@/infrastructure/persistence/sqlite/userRepository.js'
import { SqliteVehicleRepository } from '@/infrastructure/persistence/sqlite/vehicleRepository.js'
import { seedManufacturerCatalog } from '@/infrastructure/persistence/sqlite/seedManufacturerCatalog.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { createRequireAdmin } from '@/infrastructure/http/middleware/admin.middleware.js'
import { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import { Logger } from '@/infrastructure/observability/logger.js'
import { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Repositorios que necesita la capa de diagnostico y administracion. */
interface DiagnosisLayerRepos {
  readonly vehicleRepo: SqliteVehicleRepository
  readonly userRepo: SqliteUserRepository
  readonly logRepo: PersistenceRepositories['logRepo']
  readonly auditRepo: PersistenceRepositories['auditRepo']
}

/**
 * Monta todo lo que cuelga del LLM y del vehiculo: cliente del modelo, catalogo
 * vectorial, busqueda web, servicio de diagnostico y los dos controladores que los
 * exponen. Es la mitad cara del arranque, y la unica con `await`.
 */
async function createDiagnosisLayer(
  config: AppConfig,
  logger: LoggerPort,
  repos: DiagnosisLayerRepos,
): Promise<{ diagnosisController: DiagnosisController; adminController: AdminController }> {
  const llmClient = createLlmClient(config, logger)
  const knowledgeStack = await createKnowledgeStack(config, logger)
  const diagnosisService = createDiagnosisService({
    config,
    llmClient,
    knowledgeStack,
    webSearch: createWebSearchPort(config),
    vehicleRepo: repos.vehicleRepo,
    logger,
  })
  return {
    diagnosisController: new DiagnosisController(diagnosisService, logger),
    adminController: createAdminController(
      { userRepo: repos.userRepo, logRepo: repos.logRepo, auditRepo: repos.auditRepo },
      knowledgeStack,
    ),
  }
}

/** Composition Root: cablea todas las dependencias y devuelve la app Express configurada. */
export async function buildApp(config: AppConfig): Promise<Application> {
  const { db, auditRepo, userRepo, tokenStore, logRepo, passwordResetTokenRepo } =
    createPersistenceRepositories(config)
  const logger = new Logger(config.NODE_ENV, db)
  const vehicleRepo = new SqliteVehicleRepository(db)
  const emailSender = createEmailSender(config, logger)
  const auth = createAuthStack(
    config,
    { userRepo, tokenStore, passwordResetTokenRepo },
    emailSender,
    logger,
  )
  await seedAdminUser(config, userRepo, auth.authService, logger)
  await seedManufacturerCatalog(vehicleRepo, logger)
  const authController = createAuthController(auth)
  const profile = createProfileStack({ userRepo, tokenStore }, auth.authService, logger)

  const { diagnosisController, adminController } = await createDiagnosisLayer(config, logger, {
    vehicleRepo,
    userRepo,
    logRepo,
    auditRepo,
  })

  return createServer({
    authController,
    diagnosisController,
    profileController: profile.profileController,
    adminController,
    requireAdmin: createRequireAdmin(userRepo),
    auditRepo,
    logger,
    allowedOrigins: config.ALLOWED_ORIGINS,
    nodeEnv: config.NODE_ENV,
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
  })
}
