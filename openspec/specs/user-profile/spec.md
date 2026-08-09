## Requirements

### Requirement: Cambio de contraseña autenticado
El sistema SHALL exponer `POST /api/profile/change-password` (requiere sesion autenticada via `authenticateToken`), que recibe `{ currentPassword, newPassword }`, verifica `currentPassword` contra el hash almacenado del usuario autenticado, y si es correcta y `newPassword` cumple la politica de fortaleza y es distinta de la actual, actualiza el hash y revoca todos los refresh tokens del usuario.

#### Scenario: Cambio de contraseña exitoso
- **WHEN** un usuario autenticado envia `{ currentPassword: "PassActual1!", newPassword: "PassNueva2!" }` y `currentPassword` coincide con el hash almacenado
- **THEN** el sistema actualiza el hash de contraseña, revoca todos los refresh tokens del usuario y responde `200 { message: "Password updated" }`

#### Scenario: Contraseña actual incorrecta
- **WHEN** `currentPassword` no coincide con el hash almacenado
- **THEN** el sistema responde `401 { error: "Current password is incorrect" }` sin modificar nada

#### Scenario: Nueva contraseña igual a la actual
- **WHEN** `newPassword` es identica a `currentPassword` y ambas son correctas
- **THEN** el sistema responde `400 { error: "New password must be different from the current password" }`

#### Scenario: Nueva contraseña no cumple la politica de fortaleza
- **WHEN** `newPassword` no cumple min 8 / max 128 / 1 mayuscula / 1 numero / 1 caracter especial
- **THEN** el sistema responde `400` con detalles de validacion Zod

#### Scenario: Sin sesion autenticada
- **WHEN** se envia la peticion sin header `Authorization` valido
- **THEN** el sistema responde `401` (interceptado por `authenticateToken` antes de llegar al controller)

#### Scenario: Rate limiting contra fuerza bruta con token robado
- **WHEN** se supera el limite de peticiones a `/api/profile/change-password` desde la misma IP en la ventana configurada
- **THEN** el sistema responde `429` sin procesar la peticion

#### Scenario: Cambio de contraseña revoca todas las sesiones activas
- **WHEN** el usuario tenia uno o mas refresh tokens activos antes del cambio
- **THEN** tras un cambio exitoso, todos esos refresh tokens quedan revocados y `POST /api/auth/refresh` con cualquiera de ellos responde `401`

### Requirement: Edicion parcial de perfil
El sistema SHALL exponer `PATCH /api/profile` (requiere sesion autenticada), que permite actualizar parcialmente `username`, `address`, `businessName`, `taxId` del usuario autenticado. El email de login SHALL quedar fuera de alcance de este endpoint.

#### Scenario: Actualizacion parcial exitosa
- **WHEN** un usuario autenticado envia `{ address: "Calle Nueva 45" }`
- **THEN** el sistema actualiza solo `address`, deja el resto de campos intactos, y responde `200` con el usuario actualizado (sin `passwordHash`, vía el mismo patron que `toSafeUser`)

#### Scenario: Cambio de username unico
- **WHEN** se envia `{ username: "nuevoUsuario" }` y ese username no esta en uso por otro usuario
- **THEN** el sistema actualiza el username y responde `200` con el usuario actualizado

#### Scenario: Cambio de username duplicado
- **WHEN** se envia `{ username: "existente" }` y ese username ya pertenece a otro usuario
- **THEN** el sistema responde `409 { error: "Username already taken" }` sin modificar nada

#### Scenario: Mismo username que ya tenia el usuario
- **WHEN** un usuario envia `{ username: "miPropioUsuario" }` que coincide con su propio username actual
- **THEN** el sistema responde `200` sin error de duplicado (no se compara contra si mismo)

#### Scenario: El email queda fuera de alcance
- **WHEN** se envia `{ email: "nuevo@mail.com" }` en el body de `PATCH /api/profile`
- **THEN** el sistema responde `400` (campo no reconocido por el schema Zod) y el email del usuario no se modifica

#### Scenario: Sin campos validos en el body
- **WHEN** se envia un body vacio `{}`
- **THEN** el sistema responde `200` con el usuario sin cambios (actualizacion no-op) o `400` si el schema exige al menos un campo — comportamiento exacto a fijar en `design.md`/implementacion, pero en ningun caso SHALL modificar el email

#### Scenario: Sin sesion autenticada
- **WHEN** se envia la peticion sin header `Authorization` valido
- **THEN** el sistema responde `401` (interceptado por `authenticateToken` antes de llegar al controller)

#### Scenario: Respuesta nunca incluye el hash de contraseña
- **WHEN** cualquier peticion a `PATCH /api/profile` o `POST /api/profile/change-password` responde con datos del usuario
- **THEN** el campo `passwordHash` SHALL estar ausente del body de la respuesta
