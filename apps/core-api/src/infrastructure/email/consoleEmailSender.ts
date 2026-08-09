import type { EmailMessage, EmailSenderPort } from '@/application/ports/EmailSenderPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * Adapter de fallback para {@link EmailSenderPort}: loguea el mensaje en vez de enviarlo.
 * Se usa automaticamente cuando no hay `SMTP_HOST` configurado (dev/CI).
 */
export function createConsoleEmailSender(logger: LoggerPort): EmailSenderPort {
  return {
    async send(message: EmailMessage): Promise<void> {
      try {
        logger.info('email.console_send', {
          to: message.to,
          subject: message.subject,
          text: message.text,
        })
      } catch {
        // Nunca propaga: el fallo de logging no debe romper el flujo de negocio.
      }
    },
  }
}
