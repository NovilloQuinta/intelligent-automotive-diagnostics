import { z } from 'zod'

/**
 * Regex de fortaleza de contraseña: minimo 1 mayuscula, 1 numero y 1 caracter especial.
 * Compartida por RegisterUserInput, ResetPasswordInput y ChangePasswordInput.
 */
export const PASSWORD_STRENGTH_REGEX = /^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).*$/

/** Esquema Zod reutilizable para una contraseña que cumple la politica de fortaleza. */
export const strongPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(
    PASSWORD_STRENGTH_REGEX,
    'Password must contain at least 1 uppercase letter, 1 number, and 1 special character',
  )
