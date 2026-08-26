import { z } from 'zod'

/**
 * Contratos de respuesta de autenticacion y perfil.
 *
 * Las peticiones no se declaran aqui: ya existen como schemas Zod en
 * `application/dto/auth/` y el registro de rutas las referencia directamente, de modo
 * que la documentacion no puede contradecir a la validacion.
 *
 * Cada campo lleva `.describe()` porque el documento OpenAPI se genera desde estos
 * objetos: lo que no se describa aqui sale vacio en Swagger UI.
 */

/** Campos de usuario comunes a todas las proyecciones, sin el hash de contrasena. */
const userBaseShape = {
  id: z.number().int().describe('Identificador interno del usuario'),
  username: z.string().describe('Nombre de usuario, unico'),
  email: z.string().describe('Correo electronico, unico y usado como credencial'),
  userType: z
    .enum(['individual', 'workshop'])
    .describe('Particular o taller. El taller habilita los campos de facturacion'),
  role: z.enum(['user', 'admin']).describe('Rol de autorizacion. `admin` abre `/api/admin`'),
  businessName: z.string().nullable().describe('Razon social. Solo talleres'),
  taxId: z.string().nullable().describe('NIF o CIF. Solo talleres'),
  address: z.string().nullable().describe('Direccion fiscal. Solo talleres'),
  createdAt: z.string().describe('Fecha de alta en ISO 8601'),
}

/** Usuario autenticado tal y como lo proyecta `AuthController.me`. */
export const userProfileSchema = z
  .object({
    ...userBaseShape,
    isWorkshop: z.boolean().describe('Derivado de `userType`, para no repetir la comparacion'),
    isAdmin: z.boolean().describe('Derivado de `role`, para no repetir la comparacion'),
  })
  .describe('Usuario autenticado que devuelve `GET /api/auth/me`')

/** Par de tokens emitido por login y refresh. */
export const tokenPairSchema = z
  .object({
    accessToken: z.string().describe('JWT de acceso. Va en `Authorization: Bearer`. Vida corta'),
    refreshToken: z.string().describe('JWT de refresco, para renovar el de acceso sin relogin'),
  })
  .describe('Par de tokens JWT emitido por login y por refresh')

/** Respuesta de registro y login: usuario mas el par de tokens. */
export const authResponseSchema = z
  .object({
    user: z
      .object({
        id: z.number().int().describe('Identificador interno del usuario'),
        username: z.string().describe('Nombre de usuario, unico'),
        email: z.string().describe('Correo electronico, unico'),
        userType: z.string().describe('`individual` o `workshop`'),
        businessName: z.string().nullable().describe('Razon social. Solo talleres'),
        taxId: z.string().nullable().describe('NIF o CIF. Solo talleres'),
        address: z.string().nullable().describe('Direccion fiscal. Solo talleres'),
        createdAt: z.string().describe('Fecha de alta en ISO 8601'),
      })
      .describe('Usuario recien creado o autenticado'),
    accessToken: z.string().describe('JWT de acceso. Va en `Authorization: Bearer`'),
    refreshToken: z.string().describe('JWT de refresco'),
  })
  .describe('Alta o login correctos: el usuario mas su par de tokens')

/**
 * Perfil devuelto por `PATCH /api/profile`.
 *
 * `UpdateProfileUseCase.execute` devuelve `Omit<User, 'passwordHash'>`, o sea la
 * entidad entera menos el hash — incluidos los campos de bloqueo por intentos
 * fallidos, y sin los booleanos derivados de {@link userProfileSchema}.
 */
export const updatedProfileSchema = z
  .object({
    ...userBaseShape,
    failedLoginAttempts: z
      .number()
      .int()
      .describe('Intentos de login fallidos consecutivos. A los 5 se bloquea la cuenta'),
    lockedUntil: z
      .string()
      .nullable()
      .describe('Fin del bloqueo en ISO 8601, o `null` si la cuenta no esta bloqueada'),
  })
  .describe('Perfil ya actualizado que devuelve `PATCH /api/profile`')

/**
 * Acuse de los flujos que solo confirman ejecucion: logout, reset de contrasena y
 * cambio de contrasena responden `{ success: true }`.
 */
export const successAckSchema = z
  .object({
    success: z.boolean().describe('Siempre `true`: el fallo viaja como codigo HTTP, no aqui'),
  })
  .describe('Acuse de logout, reset de contrasena y cambio de contrasena')

/**
 * Acuse de `POST /api/auth/forgot-password`.
 *
 * El mensaje es una constante generica y se devuelve exista o no la cuenta: distinguir
 * los dos casos permitiria enumerar usuarios registrados.
 */
export const messageAckSchema = z
  .object({
    message: z
      .string()
      .describe('Texto generico, identico exista o no la cuenta, para no filtrar usuarios'),
  })
  .describe('Acuse de `POST /api/auth/forgot-password`')

/**
 * Respuesta de `POST /api/auth/login` cuando la cuenta tiene segundo factor.
 *
 * No lleva tokens **a proposito**: hasta canjear el reto no hay sesion. El campo
 * `twoFactorRequired` es el discriminante que la SPA usa para decidir si navega al
 * escritorio o pide el codigo.
 */
export const twoFactorChallengeSchema = z
  .object({
    twoFactorRequired: z.literal(true).describe('Siempre `true` en esta variante'),
    challengeToken: z
      .string()
      .describe('Vale opaco de un solo uso que se presenta en `POST /api/auth/2fa/verify`'),
    expiresAt: z.string().describe('Caducidad del reto en ISO-8601'),
  })
  .describe('Primer factor superado: falta el codigo del segundo')

/** Datos que devuelve `POST /api/profile/2fa/setup` para registrar la app autenticadora. */
export const twoFactorSetupSchema = z
  .object({
    otpauthUri: z.string().describe('URI `otpauth://` que codifica el QR'),
    qrDataUri: z.string().describe('El QR ya renderizado, embebible en un `<img src>`'),
    secret: z
      .string()
      .describe('Secreto en Base32, para quien no pueda escanear el QR y lo teclee'),
  })
  .describe('Alta preparada: el segundo factor **aun no esta activo**')

/**
 * Codigos de recuperacion que devuelve `POST /api/profile/2fa/activate`.
 *
 * Es la unica respuesta del sistema que los contiene en claro: a partir de aqui solo
 * quedan sus hashes.
 */
export const twoFactorRecoveryCodesSchema = z
  .object({
    recoveryCodes: z
      .array(z.string())
      .describe('Diez codigos de un solo uso. No vuelven a mostrarse nunca'),
  })
  .describe('Segundo factor activado, con sus codigos de recuperacion')
