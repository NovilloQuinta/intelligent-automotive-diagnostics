/** Mensaje de correo generico a enviar. */
export interface EmailMessage {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text: string
}

/** Contrato para el envio de correos electronicos, independiente del proveedor. */
export interface EmailSenderPort {
  send(message: EmailMessage): Promise<void>
}
