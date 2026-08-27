import type { OperationSpec } from '../registry.js'

/** Operaciones de `/api/auth` y `/api/profile`. Acompanan a `auth.routes.ts` y `profile.routes.ts`. */
export const authOperations: readonly OperationSpec[] = [
  {
    method: 'post',
    path: '/api/auth/register',
    tag: 'Auth',
    summary: 'Registro de usuario',
    description:
      'Crea una cuenta de particular o de taller. La contrasena exige mayuscula, numero y ' +
      'caracter especial, y se almacena con bcrypt de 12 rondas.',
    requestBody: 'RegisterRequest',
    responses: {
      '201': { description: 'Cuenta creada', schema: 'AuthResponse' },
      '400': { description: 'Cuerpo invalido' },
      '409': { description: 'El email o el usuario ya existen' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/login',
    tag: 'Auth',
    summary: 'Login',
    description:
      'Devuelve el par de tokens. Cinco intentos fallidos bloquean la cuenta 15 minutos: el ' +
      'bloqueo responde 423 con `Retry-After` y no se prolonga al seguir intentandolo.',
    requestBody: 'LoginRequest',
    responses: {
      '200': { description: 'Autenticado', schema: 'TokenPair' },
      '400': { description: 'Cuerpo invalido' },
      '401': { description: 'Credenciales incorrectas' },
      '423': { description: 'Cuenta bloqueada por intentos fallidos' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/refresh',
    tag: 'Auth',
    summary: 'Renovar el access token',
    description: 'Rota el refresh token: el usado queda revocado.',
    requestBody: 'RefreshRequest',
    responses: {
      '200': { description: 'Tokens renovados', schema: 'TokenPair' },
      '401': { description: 'Refresh token invalido, caducado o revocado' },
    },
  },
  {
    method: 'get',
    path: '/api/auth/me',
    tag: 'Auth',
    summary: 'Usuario autenticado',
    auth: true,
    responses: {
      '200': { description: 'Perfil del usuario', schema: 'UserProfile' },
      '401': { description: 'Falta el token o no es valido' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/logout',
    tag: 'Auth',
    summary: 'Cerrar sesion',
    description: 'Revoca el refresh token en curso.',
    responses: {
      '200': { description: 'Sesion cerrada', schema: 'SuccessAck' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/forgot-password',
    tag: 'Auth',
    summary: 'Solicitar el reseteo de contrasena',
    description:
      'Envia un email con un token de un solo uso. Responde siempre lo mismo exista o no la ' +
      'cuenta: distinguir los dos casos permitiria enumerar usuarios registrados.',
    requestBody: 'ForgotPasswordRequest',
    responses: {
      '200': { description: 'Acuse generico', schema: 'MessageAck' },
      '400': { description: 'Cuerpo invalido' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/reset-password',
    tag: 'Auth',
    summary: 'Consumir el token de reseteo',
    description: 'El token es de un solo uso, va hasheado con SHA-256 y tiene TTL.',
    requestBody: 'ResetPasswordRequest',
    responses: {
      '200': { description: 'Contrasena actualizada', schema: 'SuccessAck' },
      '400': { description: 'Token invalido o caducado' },
    },
  },
  {
    method: 'patch',
    path: '/api/profile',
    tag: 'Auth',
    summary: 'Actualizar el perfil',
    auth: true,
    requestBody: 'UpdateProfileRequest',
    responses: {
      '200': { description: 'Perfil actualizado', schema: 'UpdatedProfile' },
      '400': { description: 'Cuerpo invalido' },
      '401': { description: 'Falta el token o no es valido' },
    },
  },
  {
    method: 'post',
    path: '/api/profile/change-password',
    tag: 'Auth',
    summary: 'Cambiar la contrasena',
    description: 'Exige la contrasena actual y lleva su propio rate limit.',
    auth: true,
    requestBody: 'ChangePasswordRequest',
    responses: {
      '200': { description: 'Contrasena cambiada', schema: 'SuccessAck' },
      '400': { description: 'Cuerpo invalido o contrasena actual incorrecta' },
      '401': { description: 'Falta el token o no es valido' },
    },
  },
  {
    method: 'post',
    path: '/api/auth/2fa/verify',
    tag: 'Auth',
    summary: 'Segundo paso del login: canjear el reto por tokens',
    description:
      'Se presenta el `challengeToken` que devolvio el login junto a un codigo TOTP o de ' +
      'recuperacion. Los codigos de recuperacion valen una sola vez. Un codigo incorrecto ' +
      'cuenta para el mismo bloqueo de cuenta que una contrasena incorrecta, y el endpoint ' +
      'lleva su propio limite de 5 por minuto.',
    requestBody: 'VerifyTwoFactorRequest',
    responses: {
      '200': { description: 'Autenticado', schema: 'TokenPair' },
      '400': { description: 'Cuerpo invalido' },
      '401': { description: 'Reto invalido o caducado, o codigo incorrecto' },
      '423': { description: 'Cuenta bloqueada por intentos fallidos' },
      '429': { description: 'Demasiados intentos' },
    },
  },
  {
    method: 'post',
    path: '/api/profile/2fa/setup',
    tag: 'Auth',
    summary: 'Preparar el alta del segundo factor',
    description:
      'Genera el secreto TOTP, lo guarda cifrado y devuelve el QR. **No activa nada**: ' +
      'hace falta confirmar con un codigo en `/api/profile/2fa/activate`, para que un QR ' +
      'mal escaneado no deje al usuario fuera de su cuenta. La respuesta lleva ' +
      '`Cache-Control: no-store` porque contiene el secreto en claro.',
    auth: true,
    responses: {
      '200': { description: 'Alta preparada', schema: 'TwoFactorSetup' },
      '401': { description: 'Falta el token o no es valido' },
      '409': { description: 'El segundo factor ya esta activo' },
    },
  },
  {
    method: 'post',
    path: '/api/profile/2fa/activate',
    tag: 'Auth',
    summary: 'Activar el segundo factor',
    description:
      'Confirma con un codigo generado por la app y enciende el segundo factor. Devuelve ' +
      'los diez codigos de recuperacion: es la unica vez que salen en claro.',
    auth: true,
    responses: {
      '200': { description: 'Activado', schema: 'TwoFactorRecoveryCodes' },
      '400': { description: 'Falta el codigo' },
      '401': { description: 'Falta el token, o el codigo es incorrecto' },
      '409': { description: 'No se ha preparado el alta' },
    },
  },
  {
    method: 'post',
    path: '/api/profile/2fa/disable',
    tag: 'Auth',
    summary: 'Desactivar el segundo factor',
    description:
      'Exige contrasena **y** un codigo vigente (TOTP o de recuperacion). Con solo el ' +
      'access token no se puede: un token robado es justo lo que el segundo factor cubre. ' +
      'Borra el secreto y los codigos de recuperacion.',
    auth: true,
    responses: {
      '200': { description: 'Desactivado', schema: 'SuccessAck' },
      '401': { description: 'Falta el token, o la contrasena o el codigo son incorrectos' },
      '423': { description: 'Cuenta bloqueada por intentos fallidos' },
      '429': { description: 'Demasiados intentos' },
    },
  },
]
