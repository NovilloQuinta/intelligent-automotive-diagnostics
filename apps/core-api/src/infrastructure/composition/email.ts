import { createNodemailerEmailSender } from '@/infrastructure/email/nodemailerEmailSender.js'
import { createConsoleEmailSender } from '@/infrastructure/email/consoleEmailSender.js'
import type { EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Composicion del envio de email. */

/**
 * Crea el adapter de envio de email segun la configuracion: nodemailer real via SMTP
 * si hay `SMTP_HOST` configurado, o el fallback de consola en dev/CI.
 */
export function createEmailSender(config: AppConfig, logger: LoggerPort): EmailSenderPort {
  if (config.SMTP_HOST) {
    return createNodemailerEmailSender({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      from: config.SMTP_FROM,
    })
  }
  return createConsoleEmailSender(logger)
}
