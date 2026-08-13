/** Fondo oscuro de la aplicacion. */
const APP_BACKGROUND = '#0d1117'

/** Fondo de tarjeta (superficie elevada) de la aplicacion. */
const APP_CARD = '#161b22'

/** Color de acento (primario) de la aplicacion. */
const APP_ACCENT = '#ff6b35'

/** Color de texto principal sobre fondo oscuro. */
const APP_TEXT = '#e6edf3'

/** Color de texto atenuado (notas y avisos). */
const APP_MUTED = '#8b949e'

/** Email de reseteo de contraseña listo para enviar. */
export interface ResetPasswordEmail {
  readonly subject: string
  readonly html: string
  readonly text: string
}

/** Escapa los caracteres HTML de un texto para evitar inyeccion en el cuerpo. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Construye el email de reseteo de contraseña: asunto, cuerpo HTML estilizado
 * con los colores de la aplicacion y version en texto plano, todos en castellano.
 */
export function buildResetPasswordEmail(resetUrl: string): ResetPasswordEmail {
  const subject = 'Restablece tu contraseña'
  const safeUrl = escapeHtml(resetUrl)

  const text = `Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.\n\nAbre este enlace para crear una nueva contraseña: ${resetUrl}\n\nSi no has solicitado este cambio, puedes ignorar este correo.`

  const html = `
<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background-color:${APP_BACKGROUND};font-family:Arial,Helvetica,sans-serif;">
  <div style="padding:32px 16px;">
    <div style="max-width:600px;margin:0 auto;background-color:${APP_CARD};border:1px solid rgba(255,255,255,0.1);border-radius:8px;overflow:hidden;">
      <div style="padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.1);">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="width:32px;height:32px;border:1px solid rgba(255,255,255,0.1);border-radius:6px;background-color:rgba(255,255,255,0.05);text-align:center;vertical-align:middle;font-size:16px;line-height:32px;">
              🔧
            </td>
            <td style="padding-left:10px;font-size:15px;font-weight:bold;color:${APP_TEXT};vertical-align:middle;">IADiagnostics</td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-size:20px;font-weight:bold;color:${APP_ACCENT};">Recupera tu contraseña</p>
      </div>
      <div style="padding:24px 32px;color:${APP_TEXT};font-size:15px;line-height:1.6;">
        <p style="margin:0 0 16px;">Hemos recibido una solicitud para restablecer la contraseña de tu cuenta.</p>
        <p style="margin:0 0 24px;">
          <a href="${safeUrl}" style="display:inline-block;padding:12px 24px;background-color:${APP_ACCENT};color:${APP_BACKGROUND};font-weight:bold;text-decoration:none;border-radius:6px;">Restablecer contraseña</a>
        </p>
        <p style="margin:0 0 8px;color:${APP_MUTED};font-size:13px;">Si el botón no funciona, copia y pega este enlace en tu navegador:</p>
        <p style="margin:0 0 24px;word-break:break-all;"><a href="${safeUrl}" style="color:${APP_ACCENT};">${safeUrl}</a></p>
        <p style="margin:0;color:${APP_MUTED};font-size:13px;">Si no has solicitado este cambio, puedes ignorar este correo.</p>
      </div>
    </div>
  </div>
</body>
</html>`.trim()

  return { subject, html, text }
}
