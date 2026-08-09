import nodemailer from 'nodemailer'
import type { EmailMessage, EmailSenderPort } from '@/application/ports/EmailSenderPort.js'

/** Configuracion SMTP generica (compatible con cualquier proveedor, ej. IONOS). */
export interface NodemailerConfig {
  readonly host: string
  readonly port: number
  readonly secure: boolean
  readonly user?: string
  readonly pass?: string
  readonly from: string
}

/**
 * Crea un {@link EmailSenderPort} que envia correos reales via SMTP con nodemailer.
 * Los errores del transporte se propagan (la captura y el logueo viven en el use case).
 */
export function createNodemailerEmailSender(config: NodemailerConfig): EmailSenderPort {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
  })

  return {
    async send(message: EmailMessage): Promise<void> {
      await transporter.sendMail({
        from: config.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      })
    },
  }
}
