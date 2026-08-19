import { createAuthService } from '@/infrastructure/services/authService.js'
import { RegisterUserUseCase } from '@/application/use-cases/RegisterUserUseCase.js'
import { LoginUserUseCase } from '@/application/use-cases/LoginUserUseCase.js'
import { RefreshTokenUseCase } from '@/application/use-cases/RefreshTokenUseCase.js'
import { GetCurrentUserUseCase } from '@/application/use-cases/GetCurrentUserUseCase.js'
import { LogoutUserUseCase } from '@/application/use-cases/LogoutUserUseCase.js'
import { ForgotPasswordUseCase } from '@/application/use-cases/ForgotPasswordUseCase.js'
import { ResetPasswordUseCase } from '@/application/use-cases/ResetPasswordUseCase.js'
import { ChangePasswordUseCase } from '@/application/use-cases/ChangePasswordUseCase.js'
import { UpdateProfileUseCase } from '@/application/use-cases/UpdateProfileUseCase.js'
import { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import { Email } from '@/domain/value-objects/Email.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { PersistenceRepositories } from '@/infrastructure/composition/persistence.js'

/** Composicion de autenticacion y perfil: casos de uso y sus controladores. */

/** Casos de uso de autenticacion, ya construidos sobre el servicio de tokens. */
export interface AuthStack {
  readonly authService: ReturnType<typeof createAuthService>
  readonly registerUseCase: RegisterUserUseCase
  readonly loginUseCase: LoginUserUseCase
  readonly refreshUseCase: RefreshTokenUseCase
  readonly getCurrentUserUseCase: GetCurrentUserUseCase
  readonly logoutUseCase: LogoutUserUseCase
  readonly forgotPasswordUseCase: ForgotPasswordUseCase
  readonly resetPasswordUseCase: ResetPasswordUseCase
}

/** Crea el servicio de autenticacion y sus casos de uso. */
// eslint-disable-next-line max-lines-per-function -- lista declarativa de casos de uso
export function createAuthStack(
  config: AppConfig,
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore' | 'passwordResetTokenRepo'>,
  emailSender: EmailSenderPort,
  logger: LoggerPort,
): AuthStack {
  const authService = createAuthService({
    accessTokenSecret: config.ACCESS_TOKEN_SECRET,
    refreshTokenSecret: config.REFRESH_TOKEN_SECRET,
    accessTokenExpiresIn: config.ACCESS_TOKEN_TTL,
    refreshTokenExpiresIn: config.REFRESH_TOKEN_TTL,
    tokenStore: repos.tokenStore,
  })
  const refreshTokenTtlMs = config.REFRESH_TOKEN_TTL * 1000
  return {
    authService,
    registerUseCase: new RegisterUserUseCase(
      repos.userRepo,
      authService,
      repos.tokenStore,
      refreshTokenTtlMs,
      logger,
    ),
    loginUseCase: new LoginUserUseCase(
      repos.userRepo,
      authService,
      repos.tokenStore,
      refreshTokenTtlMs,
      logger,
    ),
    refreshUseCase: new RefreshTokenUseCase(authService, logger),
    getCurrentUserUseCase: new GetCurrentUserUseCase(repos.userRepo),
    logoutUseCase: new LogoutUserUseCase(repos.tokenStore, logger),
    forgotPasswordUseCase: new ForgotPasswordUseCase(
      repos.userRepo,
      repos.passwordResetTokenRepo,
      emailSender,
      { ttlMinutes: config.PASSWORD_RESET_TTL_MINUTES, appBaseUrl: config.APP_BASE_URL },
      logger,
    ),
    resetPasswordUseCase: new ResetPasswordUseCase(
      repos.passwordResetTokenRepo,
      repos.userRepo,
      authService,
      repos.tokenStore,
      logger,
    ),
  }
}

/** Casos de uso de perfil autenticado y su controlador. */
export interface ProfileStack {
  readonly changePasswordUseCase: ChangePasswordUseCase
  readonly updateProfileUseCase: UpdateProfileUseCase
  readonly profileController: ProfileController
}

/** Crea los casos de uso y el controlador de perfil autenticado. */
export function createProfileStack(
  repos: Pick<PersistenceRepositories, 'userRepo' | 'tokenStore'>,
  authService: ReturnType<typeof createAuthService>,
  logger: LoggerPort,
): ProfileStack {
  const changePasswordUseCase = new ChangePasswordUseCase(
    repos.userRepo,
    authService,
    repos.tokenStore,
    logger,
  )
  const updateProfileUseCase = new UpdateProfileUseCase(repos.userRepo, logger)
  return {
    changePasswordUseCase,
    updateProfileUseCase,
    profileController: new ProfileController(changePasswordUseCase, updateProfileUseCase),
  }
}

/**
 * Crea el primer administrador desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` si no existe ya.
 *
 * Idempotente: si ya hay un usuario con ese email no se crea uno nuevo ni se
 * sobrescribe su contraseña (puede haber sido cambiada a mano). Reusa el
 * hashing de {@link AuthServicePort} para no introducir un segundo camino de
 * bcrypt. Sin las variables de entorno, no falla el arranque: solo avisa.
 *
 * La contraseña nunca se pasa a `logger`, ni siquiera en el warning.
 */
export async function seedAdminUser(
  config: AppConfig,
  userRepo: UserRepository,
  authService: AuthServicePort,
  logger: LoggerPort,
): Promise<void> {
  if (!config.ADMIN_EMAIL || !config.ADMIN_PASSWORD) {
    logger.warn('Admin seed skipped: ADMIN_EMAIL/ADMIN_PASSWORD not configured')
    return
  }

  const existing = await userRepo.findByEmail(config.ADMIN_EMAIL)
  if (existing) {
    return
  }

  const passwordHash = await authService.hashPassword(config.ADMIN_PASSWORD)
  await userRepo.create({
    username: 'admin',
    email: new Email(config.ADMIN_EMAIL),
    passwordHash,
    userType: 'individual',
    role: 'admin',
  })

  logger.info('Admin user seeded', { email: config.ADMIN_EMAIL })
}

/** Traduce el stack de auth a los siete casos de uso que espera el controlador. */
export function createAuthController(auth: AuthStack): AuthController {
  return new AuthController({
    registerUser: auth.registerUseCase,
    loginUser: auth.loginUseCase,
    refreshToken: auth.refreshUseCase,
    getCurrentUser: auth.getCurrentUserUseCase,
    logoutUser: auth.logoutUseCase,
    forgotPassword: auth.forgotPasswordUseCase,
    resetPassword: auth.resetPasswordUseCase,
  })
}
