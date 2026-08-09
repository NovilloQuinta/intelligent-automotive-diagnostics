import type { Response } from 'express'
import { ZodError } from 'zod'

/** Mensajes de error HTTP genéricos, comunes a los controladores REST. */
export const COMMON_ERROR_MESSAGES = {
  validationFailed: 'Validation failed',
  internalError: 'Internal server error',
} as const

/**
 * Responde 400 si el error es de validación Zod.
 *
 * @returns `true` si ha respondido, para que el llamante corte.
 */
export function respondIfValidationError(err: unknown, res: Response): boolean {
  if (!(err instanceof ZodError)) return false
  res.status(400).json({ error: COMMON_ERROR_MESSAGES.validationFailed, details: err.issues })
  return true
}

/** Cola común: 500 genérico, sin filtrar el detalle interno al cliente. */
export function respondInternalError(res: Response): void {
  res.status(500).json({ error: COMMON_ERROR_MESSAGES.internalError })
}
