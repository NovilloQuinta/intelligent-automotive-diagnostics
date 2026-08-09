## ADDED Requirements

### Requirement: Solicitud de recuperacion de contraseña
El sistema SHALL exponer `POST /api/auth/forgot-password`, que recibe `{ email }`, genera un token opaco de 256 bits, persiste solo su hash SHA-256 en `password_reset_tokens` con expiracion `PASSWORD_RESET_TTL_MINUTES` (60 por defecto), invalida cualquier token previo no usado del mismo usuario, y envia por email un enlace `${APP_BASE_URL}/reset-password?token=...`.

#### Scenario: Email existente
- **WHEN** se envia `{ email: "juan@mail.com" }` y ese email esta registrado
- **THEN** el sistema crea un token de reseteo, envia el email con el link y responde `200 { message: "If that email exists, a reset link has been sent." }`

#### Scenario: Email inexistente — respuesta identica (anti-enumeracion)
- **WHEN** se envia `{ email: "noexiste@mail.com" }` y ese email NO esta registrado
- **THEN** el sistema responde `200` con el mismo mensaje generico que en el caso de email existente, sin crear ningun token ni enviar ningun email

#### Scenario: Fallo en el envio de email no se propaga al cliente
- **WHEN** el email existe pero el adapter de envio de email lanza un error (ej. SMTP inalcanzable)
- **THEN** el sistema loguea el error y responde igualmente `200` con el mensaje generico, sin exponer el error al cliente

#### Scenario: Peticiones repetidas invalidan el token anterior
- **WHEN** un usuario solicita `forgot-password` dos veces seguidas
- **THEN** el primer token queda invalidado (no utilizable) y solo el segundo token generado es valido para `reset-password`

#### Scenario: Rate limiting estricto
- **WHEN** se supera el limite de peticiones a `/api/auth/forgot-password` desde la misma IP en la ventana configurada
- **THEN** el sistema responde `429` sin procesar la peticion, con un limite mas estricto que el aplicado a `/api/auth/login`

### Requirement: Confirmacion de recuperacion de contraseña
El sistema SHALL exponer `POST /api/auth/reset-password`, que recibe `{ token, newPassword }`, valida el token (existente, no usado, no caducado) y la fortaleza de `newPassword` (min 8, max 128, 1 mayuscula, 1 numero, 1 caracter especial), y si es valido actualiza la contraseña, marca el token como usado, revoca todos los refresh tokens del usuario y resetea el bloqueo por intentos fallidos.

#### Scenario: Reset exitoso
- **WHEN** se envia un `token` valido (no usado, no caducado) junto con `newPassword: "NuevaPass1!"`
- **THEN** el sistema hashea y guarda la nueva contraseña, marca el token como usado, revoca todos los refresh tokens del usuario, resetea `failedLoginAttempts`/`lockedUntil`, y responde `200 { message: "Password updated" }`

#### Scenario: Token inexistente
- **WHEN** se envia un `token` cuyo hash no existe en `password_reset_tokens`
- **THEN** el sistema responde `400 { error: "Invalid or expired token" }` sin distinguir esta causa de un token caducado o ya usado

#### Scenario: Token caducado
- **WHEN** se envia un `token` valido pero cuya `expiresAt` ya paso
- **THEN** el sistema responde `400 { error: "Invalid or expired token" }`

#### Scenario: Token ya usado
- **WHEN** se envia un `token` que ya fue consumido en un reset anterior
- **THEN** el sistema responde `400 { error: "Invalid or expired token" }`

#### Scenario: Nueva contraseña no cumple la politica de fortaleza
- **WHEN** se envia un `token` valido con `newPassword: "corta"`
- **THEN** el sistema responde `400` con detalles de validacion Zod, sin consumir el token

#### Scenario: Reset revoca todas las sesiones activas
- **WHEN** el usuario tenia uno o mas refresh tokens activos antes del reset
- **THEN** tras un reset exitoso, todos esos refresh tokens quedan revocados y `POST /api/auth/refresh` con cualquiera de ellos responde `401`
