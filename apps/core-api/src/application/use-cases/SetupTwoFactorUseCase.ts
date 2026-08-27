import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { TotpPort } from '@/application/ports/TotpPort.js'
import type { SecretCipherPort } from '@/application/ports/SecretCipherPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { buildOtpauthUri } from '@/domain/twoFactor.js'
import { NULL_LOGGER } from '@/application/shared/nullLogger.js'

/** Dependencias del alta del segundo factor. */
export interface SetupTwoFactorDeps {
  readonly userRepo: UserRepository
  readonly totp: TotpPort
  readonly cipher: SecretCipherPort
  /** Nombre del servicio tal como lo mostrara la app autenticadora. */
  readonly issuer: string
  readonly logger?: LoggerPort
}

/** Lo que necesita la pantalla de alta para que el usuario registre su app. */
export interface SetupTwoFactorOutput {
  /** URI `otpauth://` que codifica el QR. */
  readonly otpauthUri: string
  /** El QR ya renderizado, embebible directamente en un `<img src>`. */
  readonly qrDataUri: string
  /**
   * El secreto en Base32.
   *
   * Se entrega a proposito: sin el, quien no pueda escanear el QR —una camara
   * rota, un gestor de contrasenas de escritorio— no puede darse de alta. Es el
   * unico momento del ciclo en que sale del servidor en claro.
   */
  readonly secret: string
}

/**
 * Caso de uso: preparar el alta del segundo factor.
 *
 * Genera el secreto y lo guarda cifrado, pero **no activa nada**: el segundo
 * factor se enciende en {@link ActivateTwoFactorUseCase}, cuando el usuario
 * demuestra que su app genera codigos validos. Sin esa separacion, un QR mal
 * escaneado dejaria la cuenta inaccesible.
 */
export class SetupTwoFactorUseCase {
  private readonly log: LoggerPort

  constructor(private readonly deps: SetupTwoFactorDeps) {
    this.log = deps.logger ?? NULL_LOGGER
  }

  async execute(userId: number): Promise<SetupTwoFactorOutput> {
    const { userRepo, totp, cipher, issuer } = this.deps

    const user = await userRepo.findById(userId)
    if (user?.twoFactorEnabled) {
      // Regenerar el secreto de quien ya lo tiene activo lo dejaria fuera al
      // instante: su app seguiria generando codigos del secreto anterior.
      throw new TwoFactorAlreadyEnabledError()
    }

    const secret = totp.generateSecret()
    await userRepo.saveTwoFactorSecret(userId, cipher.encrypt(secret))

    const otpauthUri = buildOtpauthUri({
      issuer,
      account: user?.email.value ?? String(userId),
      secret,
    })

    this.log.info('auth.two_factor_setup_started', { userId })

    return { otpauthUri, qrDataUri: await totp.toQrDataUri(otpauthUri), secret }
  }
}

/** El usuario ya tiene el segundo factor activo: hay que desactivarlo antes de rehacerlo. */
export class TwoFactorAlreadyEnabledError extends Error {
  constructor() {
    super('Two-factor authentication is already enabled')
    this.name = 'TwoFactorAlreadyEnabledError'
  }
}
