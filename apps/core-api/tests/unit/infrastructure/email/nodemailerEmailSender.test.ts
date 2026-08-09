import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSendMail = vi.fn()
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail })

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
  createTransport: mockCreateTransport,
}))

const { createNodemailerEmailSender } =
  await import('@/infrastructure/email/nodemailerEmailSender.js')

describe('createNodemailerEmailSender', () => {
  beforeEach(() => {
    mockSendMail.mockReset()
    mockCreateTransport.mockClear()
  })

  it('crea el transporte con host/puerto/secure/auth desde la config', () => {
    createNodemailerEmailSender({
      host: 'smtp.ionos.es',
      port: 587,
      secure: false,
      user: 'no-reply@example.com',
      pass: 'secret',
      from: 'no-reply@example.com',
    })

    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: 'smtp.ionos.es',
      port: 587,
      secure: false,
      auth: { user: 'no-reply@example.com', pass: 'secret' },
    })
  })

  it('llama a sendMail con from/to/subject/html/text correctos', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'abc' })
    const sender = createNodemailerEmailSender({
      host: 'smtp.ionos.es',
      port: 587,
      secure: false,
      user: 'no-reply@example.com',
      pass: 'secret',
      from: 'no-reply@example.com',
    })

    await sender.send({
      to: 'juan@mail.com',
      subject: 'Password reset request',
      html: '<p>link</p>',
      text: 'link',
    })

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'no-reply@example.com',
      to: 'juan@mail.com',
      subject: 'Password reset request',
      html: '<p>link</p>',
      text: 'link',
    })
  })

  it('propaga el error del transporte (la captura vive en el use case)', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP connection refused'))
    const sender = createNodemailerEmailSender({
      host: 'smtp.ionos.es',
      port: 587,
      secure: false,
      user: 'no-reply@example.com',
      pass: 'secret',
      from: 'no-reply@example.com',
    })

    await expect(
      sender.send({ to: 'x@mail.com', subject: 's', html: 'h', text: 't' }),
    ).rejects.toThrow('SMTP connection refused')
  })
})
