import { AesGcmSecretCipher } from '@/infrastructure/security/AesGcmSecretCipher.js'
import { OtplibTotpAdapter } from '@/infrastructure/security/OtplibTotpAdapter.js'
import { SetupTwoFactorUseCase } from '@/application/use-cases/SetupTwoFactorUseCase.js'
import { ActivateTwoFactorUseCase } from '@/application/use-cases/ActivateTwoFactorUseCase.js'
import { DisableTwoFactorUseCase } from '@/application/use-cases/DisableTwoFactorUseCase.js'
import { VerifyTwoFactorUseCase } from '@/application/use-cases/VerifyTwoFactorUseCase.js'
import { TwoFactorController } from '@/infrastructure/http/controllers/TwoFactorController.js'
import type { AuthServicePort } from '@/application/ports/AuthServicePort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'
import type { PersistenceRepositories } from '@/infrastructure/composition/persistence.js'
import type { TwoFactorLoginSupport } from '@/application/use-cases/LoginUserUseCase.js'

/** Composicion del segundo factor: adaptadores, casos de uso y su controlador. */

/** Nombre que vera el usuario en su app autenticadora. */
const TOTP_ISSUER = 'Intelligent Automotive Diagnostics'

/** Vida del reto entre el primer y el segundo paso del login. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000

/** Repositorios que necesita el segundo factor. */
type TwoFactorRepos = Pick<
  PersistenceRepositories,
  'userRepo' | 'tokenStore' | 'twoFactorChallengeRepo' | 'twoFactorRecoveryCodeRepo'
>

/** Lo que el resto del arranque necesita del segundo factor. */
export interface TwoFactorStack {
  readonly controller: TwoFactorController
}

/**
 * Soporte que `LoginUserUseCase` necesita para emitir retos.
 *
 * Va aparte del stack completo a proposito: solo depende del repositorio de retos,
 * asi que no arrastra al `authService` y el arranque no tiene que construir nada
 * dos veces para romper un ciclo que no existe.
 */
export function createTwoFactorLoginSupport(
  repos: Pick<PersistenceRepositories, 'twoFactorChallengeRepo'>,
): TwoFactorLoginSupport {
  return { challengeRepo: repos.twoFactorChallengeRepo, challengeTtlMs: CHALLENGE_TTL_MS }
}

/** Crea los adaptadores, los cuatro casos de uso y el controlador del segundo factor. */
export function createTwoFactorStack(
  config: AppConfig,
  repos: TwoFactorRepos,
  authService: AuthServicePort,
  logger: LoggerPort,
): TwoFactorStack {
  const totp = new OtplibTotpAdapter()
  const cipher = new AesGcmSecretCipher(config.TOTP_ENCRYPTION_KEY)
  const { userRepo, tokenStore, twoFactorChallengeRepo, twoFactorRecoveryCodeRepo } = repos
  const shared = { userRepo, recoveryCodeRepo: twoFactorRecoveryCodeRepo, totp, cipher, logger }

  return {
    controller: new TwoFactorController({
      setupTwoFactor: new SetupTwoFactorUseCase({
        userRepo,
        totp,
        cipher,
        issuer: TOTP_ISSUER,
        logger,
      }),
      activateTwoFactor: new ActivateTwoFactorUseCase(shared),
      disableTwoFactor: new DisableTwoFactorUseCase({ ...shared, authService }),
      verifyTwoFactor: new VerifyTwoFactorUseCase({
        ...shared,
        challengeRepo: twoFactorChallengeRepo,
        authService,
        tokenStore,
        refreshTokenTtlMs: config.REFRESH_TOKEN_TTL * 1000,
      }),
    }),
  }
}
