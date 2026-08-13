import { randomBytes } from 'node:crypto'
import type { UserRepository } from '@/application/ports/UserRepository.js'
import type { PasswordResetTokenRepository } from '@/application/ports/PasswordResetTokenRepository.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import { hashToken } from '@/application/shared/hashToken.js'
import { buildResetPasswordEmail } from '@/application/templates/resetPasswordEmail.js'
import {
  forgotPasswordSchema,
  type ForgotPasswordInput,
} from '@/application/dto/auth/ForgotPasswordInput.js'

const RESET_TOKEN_BYTES = 32

/** Configuracion del caso de uso ForgotPassword. */
export interface ForgotPasswordConfig {
  readonly ttlMinutes: number
  readonly appBaseUrl: string
}

/**
 * Caso de uso: solicitud de reseteo de contraseña.
 * Siempre resuelve sin lanzar, independientemente de si el email existe, la cuenta
 * esta bloqueada, o si el envio de email falla (anti-enumeracion de usuarios).
 */
export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly tokenRepo: PasswordResetTokenRepository,
    private readonly emailSender: EmailSenderPort,
    private readonly config: ForgotPasswordConfig,
    private readonly logger?: LoggerPort,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<void> {
    const parsed = forgotPasswordSchema.parse(input)

    const user = await this.userRepo.findByEmail(parsed.email)
    if (!user) {
      this.logger?.info('auth.forgot_password', { email: parsed.email, found: false })
      return
    }

    await this.tokenRepo.invalidateAllForUser(user.id)

    const token = randomBytes(RESET_TOKEN_BYTES).toString('hex')
    const tokenHash = hashToken(token)
    const expiresAt = new Date(Date.now() + this.config.ttlMinutes * 60 * 1000).toISOString()
    await this.tokenRepo.save(user.id, tokenHash, expiresAt)

    const resetUrl = `${this.config.appBaseUrl}/reset-password?token=${token}`
    const message = buildResetPasswordEmail(resetUrl)

    try {
      await this.emailSender.send({ to: parsed.email, ...message })
      this.logger?.info('auth.forgot_password', { userId: user.id, found: true })
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Unknown error'
      this.logger?.error('auth.forgot_password_email_failed', {
        userId: user.id,
        error: errMessage,
      })
    }
  }
}
