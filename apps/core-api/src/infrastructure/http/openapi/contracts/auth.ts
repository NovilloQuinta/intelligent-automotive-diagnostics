import { z } from 'zod'

/**
 * Contratos de respuesta de autenticacion y perfil.
 *
 * Las peticiones no se declaran aqui: ya existen como schemas Zod en
 * `application/dto/auth/` y el registro de rutas las referencia directamente, de modo
 * que la documentacion no puede contradecir a la validacion.
 */

/** Campos de usuario comunes a todas las proyecciones, sin el hash de contrasena. */
const userBaseShape = {
  id: z.number().int(),
  username: z.string(),
  email: z.string(),
  userType: z.enum(['individual', 'workshop']),
  role: z.enum(['user', 'admin']),
  businessName: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
}

/** Usuario autenticado tal y como lo proyecta `AuthController.me`. */
export const userProfileSchema = z.object({
  ...userBaseShape,
  isWorkshop: z.boolean(),
  isAdmin: z.boolean(),
})

/** Par de tokens emitido por login y refresh. */
export const tokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
})

/** Respuesta de registro y login: usuario mas el par de tokens. */
export const authResponseSchema = z.object({
  user: z.object({
    id: z.number().int(),
    username: z.string(),
    email: z.string(),
    userType: z.string(),
    businessName: z.string().nullable(),
    taxId: z.string().nullable(),
    address: z.string().nullable(),
    createdAt: z.string(),
  }),
  accessToken: z.string(),
  refreshToken: z.string(),
})

/**
 * Perfil devuelto por `PATCH /api/profile`.
 *
 * `UpdateProfileUseCase.execute` devuelve `Omit<User, 'passwordHash'>`, o sea la
 * entidad entera menos el hash — incluidos los campos de bloqueo por intentos
 * fallidos, y sin los booleanos derivados de {@link userProfileSchema}.
 */
export const updatedProfileSchema = z.object({
  ...userBaseShape,
  failedLoginAttempts: z.number().int(),
  lockedUntil: z.string().nullable(),
})

/**
 * Acuse de los flujos que solo confirman ejecucion: logout, reset de contrasena y
 * cambio de contrasena responden `{ success: true }`.
 */
export const successAckSchema = z.object({
  success: z.boolean(),
})

/**
 * Acuse de `POST /api/auth/forgot-password`.
 *
 * El mensaje es una constante generica y se devuelve exista o no la cuenta: distinguir
 * los dos casos permitiria enumerar usuarios registrados.
 */
export const messageAckSchema = z.object({
  message: z.string(),
})
