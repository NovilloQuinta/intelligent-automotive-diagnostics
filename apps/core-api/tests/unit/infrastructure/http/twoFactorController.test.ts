import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { TwoFactorController } from '@/infrastructure/http/controllers/TwoFactorController.js'
import { AccountLockedError } from '@/application/use-cases/LoginUserUseCase.js'
import { TwoFactorAlreadyEnabledError } from '@/application/use-cases/SetupTwoFactorUseCase.js'
import { TwoFactorSetupMissingError } from '@/application/use-cases/ActivateTwoFactorUseCase.js'
import { InvalidPasswordError } from '@/application/use-cases/DisableTwoFactorUseCase.js'
import {
  InvalidTwoFactorChallengeError,
  InvalidTwoFactorCodeError,
} from '@/application/use-cases/VerifyTwoFactorUseCase.js'

/**
 * Rutas de error del controlador del segundo factor.
 *
 * `twoFactor.integration.test.ts` cubre el camino feliz a traves del servidor
 * entero. Lo que queda fuera son las respuestas de error, y varias **no se
 * pueden provocar por HTTP**: el 401 de `requireUserId` es defensa en
 * profundidad detras de `requireAuth`, que ya habria respondido antes. Por eso
 * aqui se llama al controlador directamente con un `req`/`res` de mentira.
 *
 * Lo que se comprueba es contrato de seguridad —que un bloqueo salga 423 con su
 * `Retry-After` y que un fallo de credencial salga 401— no que el objeto se
 * construya.
 */

/** `res` de mentira que apunta el estado, el cuerpo y las cabeceras. */
function fakeRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: unknown) {
      this.body = payload
      return this
    },
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
  }
  return res
}

/** `req` de mentira: `userId` ausente simula una peticion sin autenticar. */
function fakeReq(userId?: number, body: unknown = {}): Request {
  return { userId, body } as unknown as Request
}

/** Controlador con los cuatro casos de uso mockeados; se pisan por test. */
function buildController(overrides: Record<string, unknown> = {}) {
  const rejects = (err: unknown) => ({ execute: vi.fn().mockRejectedValue(err) })
  return new TwoFactorController({
    setupTwoFactor: rejects(new Error('no usado')),
    activateTwoFactor: rejects(new Error('no usado')),
    disableTwoFactor: rejects(new Error('no usado')),
    verifyTwoFactor: rejects(new Error('no usado')),
    ...overrides,
  } as never)
}

describe('TwoFactorController — respuestas de error', () => {
  describe('sin usuario autenticado', () => {
    it.each([['setup'], ['activate'], ['disable']] as const)(
      '%s responde 401 cuando el token no dejo userId',
      async (method) => {
        const controller = buildController()
        const res = fakeRes()

        await controller[method](fakeReq(undefined), res as unknown as Response)

        expect(res.statusCode).toBe(401)
        expect(res.body).toEqual({ error: 'Access token required' })
      },
    )
  })

  describe('setup', () => {
    it('responde 409 si el segundo factor ya estaba activo', async () => {
      const controller = buildController({
        setupTwoFactor: { execute: vi.fn().mockRejectedValue(new TwoFactorAlreadyEnabledError()) },
      })
      const res = fakeRes()

      await controller.setup(fakeReq(1), res as unknown as Response)

      expect(res.statusCode).toBe(409)
    })

    it('responde 500 ante un error inesperado, sin filtrar el mensaje', async () => {
      const controller = buildController({
        setupTwoFactor: { execute: vi.fn().mockRejectedValue(new Error('la base ardio')) },
      })
      const res = fakeRes()

      await controller.setup(fakeReq(1), res as unknown as Response)

      expect(res.statusCode).toBe(500)
      expect(JSON.stringify(res.body)).not.toContain('la base ardio')
    })

    it('marca la respuesta como no cacheable, porque lleva el secreto en claro', async () => {
      const controller = buildController({
        setupTwoFactor: { execute: vi.fn().mockResolvedValue({ secret: 'S3CR3T' }) },
      })
      const res = fakeRes()

      await controller.setup(fakeReq(1), res as unknown as Response)

      expect(res.statusCode).toBe(200)
      expect(res.headers['Cache-Control']).toBe('no-store')
    })
  })

  describe('activate', () => {
    it('responde 400 cuando no llega codigo', async () => {
      const controller = buildController()
      const res = fakeRes()

      await controller.activate(fakeReq(1, {}), res as unknown as Response)

      expect(res.statusCode).toBe(400)
    })

    it('responde 400 cuando el codigo no es texto', async () => {
      const controller = buildController()
      const res = fakeRes()

      await controller.activate(fakeReq(1, { code: 123456 }), res as unknown as Response)

      expect(res.statusCode).toBe(400)
    })

    it('responde 409 si nadie habia empezado el alta', async () => {
      const controller = buildController({
        activateTwoFactor: { execute: vi.fn().mockRejectedValue(new TwoFactorSetupMissingError()) },
      })
      const res = fakeRes()

      await controller.activate(fakeReq(1, { code: '123456' }), res as unknown as Response)

      expect(res.statusCode).toBe(409)
    })

    it('responde 401 si el codigo no vale', async () => {
      const controller = buildController({
        activateTwoFactor: { execute: vi.fn().mockRejectedValue(new InvalidTwoFactorCodeError()) },
      })
      const res = fakeRes()

      await controller.activate(fakeReq(1, { code: '000000' }), res as unknown as Response)

      expect(res.statusCode).toBe(401)
    })

    it('responde 500 ante un error inesperado', async () => {
      const controller = buildController({
        activateTwoFactor: { execute: vi.fn().mockRejectedValue(new Error('vaya')) },
      })
      const res = fakeRes()

      await controller.activate(fakeReq(1, { code: '123456' }), res as unknown as Response)

      expect(res.statusCode).toBe(500)
    })
  })

  describe('cuenta bloqueada', () => {
    it('responde 423 con Retry-After cuando se conoce el desbloqueo', async () => {
      const lockedUntil = new Date(Date.now() + 90_000).toISOString()
      const controller = buildController({
        verifyTwoFactor: {
          execute: vi.fn().mockRejectedValue(new AccountLockedError(lockedUntil)),
        },
      })
      const res = fakeRes()

      await controller.verify(fakeReq(undefined, {}), res as unknown as Response)

      expect(res.statusCode).toBe(423)
      expect(res.headers['Retry-After']).toBe('90')
      expect(res.body).toMatchObject({ lockedUntil })
    })

    it('omite Retry-After cuando no se sabe hasta cuando dura', async () => {
      const controller = buildController({
        disableTwoFactor: { execute: vi.fn().mockRejectedValue(new AccountLockedError(null)) },
      })
      const res = fakeRes()

      await controller.disable(fakeReq(1, {}), res as unknown as Response)

      expect(res.statusCode).toBe(423)
      expect(res.headers['Retry-After']).toBeUndefined()
    })
  })

  describe('verify', () => {
    it('responde 401 si el reto no vale, no 400: es credencial, no cuerpo mal formado', async () => {
      const controller = buildController({
        verifyTwoFactor: {
          execute: vi.fn().mockRejectedValue(new InvalidTwoFactorChallengeError()),
        },
      })
      const res = fakeRes()

      await controller.verify(fakeReq(undefined, {}), res as unknown as Response)

      expect(res.statusCode).toBe(401)
    })

    it('responde 500 ante un error inesperado', async () => {
      const controller = buildController({
        verifyTwoFactor: { execute: vi.fn().mockRejectedValue(new Error('vaya')) },
      })
      const res = fakeRes()

      await controller.verify(fakeReq(undefined, {}), res as unknown as Response)

      expect(res.statusCode).toBe(500)
    })
  })

  describe('disable', () => {
    it('responde 401 si la contrasena no vale', async () => {
      const controller = buildController({
        disableTwoFactor: { execute: vi.fn().mockRejectedValue(new InvalidPasswordError()) },
      })
      const res = fakeRes()

      await controller.disable(fakeReq(1, { password: 'x', code: '1' }), res as unknown as Response)

      expect(res.statusCode).toBe(401)
    })

    it('responde 500 ante un error inesperado', async () => {
      const controller = buildController({
        disableTwoFactor: { execute: vi.fn().mockRejectedValue(new Error('vaya')) },
      })
      const res = fakeRes()

      await controller.disable(fakeReq(1, {}), res as unknown as Response)

      expect(res.statusCode).toBe(500)
    })

    it('devuelve success cuando todo va bien', async () => {
      const execute = vi.fn().mockResolvedValue(undefined)
      const controller = buildController({ disableTwoFactor: { execute } })
      const res = fakeRes()

      await controller.disable(
        fakeReq(7, { password: 'Secreta1!', code: '123456' }),
        res as unknown as Response,
      )

      expect(res.statusCode).toBe(200)
      expect(execute).toHaveBeenCalledWith({
        userId: 7,
        password: 'Secreta1!',
        code: '123456',
      })
    })
  })
})
