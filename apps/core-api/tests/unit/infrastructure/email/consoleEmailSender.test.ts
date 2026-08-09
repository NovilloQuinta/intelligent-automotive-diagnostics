import { describe, it, expect, vi } from 'vitest'
import { createConsoleEmailSender } from '@/infrastructure/email/consoleEmailSender.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

function createLogger(): LoggerPort {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe('createConsoleEmailSender', () => {
  it('loguea el email y el asunto via LoggerPort.info', async () => {
    const logger = createLogger()
    const sender = createConsoleEmailSender(logger)

    await sender.send({
      to: 'juan@mail.com',
      subject: 'Password reset request',
      html: '<a href="http://localhost:5173/reset-password?token=abc">link</a>',
      text: 'http://localhost:5173/reset-password?token=abc',
    })

    expect(logger.info).toHaveBeenCalledTimes(1)
    const [message, context] = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(typeof message).toBe('string')
    expect(context).toMatchObject({
      to: 'juan@mail.com',
      subject: 'Password reset request',
    })
    expect(context.text).toContain('http://localhost:5173/reset-password?token=abc')
  })

  it('nunca lanza', async () => {
    const logger = createLogger()
    logger.info = vi.fn(() => {
      throw new Error('should not propagate')
    })
    const sender = createConsoleEmailSender(logger)

    await expect(
      sender.send({ to: 'x@mail.com', subject: 's', html: 'h', text: 't' }),
    ).resolves.toBeUndefined()
  })
})
