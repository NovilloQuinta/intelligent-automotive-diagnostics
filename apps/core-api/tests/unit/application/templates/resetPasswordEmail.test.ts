import { describe, it, expect } from 'vitest'
import { buildResetPasswordEmail } from '@/application/templates/resetPasswordEmail.js'

const RESET_URL = 'http://localhost:5173/reset-password?token=abc123'

describe('buildResetPasswordEmail', () => {
  it('devuelve el asunto en castellano', () => {
    const { subject } = buildResetPasswordEmail(RESET_URL)
    expect(subject).toContain('contraseña')
  })

  it('genera HTML estilizado con los colores de la aplicacion', () => {
    const { html } = buildResetPasswordEmail(RESET_URL)
    expect(html).toContain('#ff6b35')
    expect(html).toContain('#0d1117')
    expect(html).toContain('#161b22')
  })

  it('incluye el enlace de reseteo como boton y como URL visible', () => {
    const { html } = buildResetPasswordEmail(RESET_URL)
    expect(html).toContain(`href="${RESET_URL}"`)
    expect(html).toContain(RESET_URL)
  })

  it('genera una version en texto plano en castellano con el enlace', () => {
    const { text } = buildResetPasswordEmail(RESET_URL)
    expect(text).toContain('contraseña')
    expect(text).toContain(RESET_URL)
  })

  it('escapa los caracteres HTML del enlace para evitar inyeccion', () => {
    const { html } = buildResetPasswordEmail('http://host/reset-password?token=<script>')
    expect(html).not.toContain('<script>')
  })
})
