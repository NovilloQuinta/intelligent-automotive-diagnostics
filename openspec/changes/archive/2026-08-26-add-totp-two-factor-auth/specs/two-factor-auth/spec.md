# Two-Factor Authentication

## Purpose

Segundo factor TOTP (RFC 6238) opcional por usuario y obligatorio para administradores, con
codigos de recuperacion de un solo uso para no convertir la perdida del dispositivo en la
perdida de la cuenta.

## ADDED Requirements

### Requirement: Alta del segundo factor en dos fases
El sistema SHALL generar un secreto TOTP y entregarlo como codigo QR sin activar el segundo
factor, y SHALL activarlo solo tras recibir un codigo valido generado con ese secreto.

#### Scenario: Preparar el alta
- **GIVEN** un usuario autenticado sin segundo factor
- **WHEN** solicita el alta
- **THEN** recibe una URI `otpauth://` y su representacion como imagen QR
- **AND** el segundo factor sigue **desactivado**
- **AND** iniciar sesion sigue devolviendo el par de tokens sin pedir codigo

#### Scenario: Activar con un codigo valido
- **GIVEN** un usuario que ha preparado el alta
- **WHEN** envia un codigo valido para el secreto generado
- **THEN** el segundo factor queda activado
- **AND** recibe sus codigos de recuperacion

#### Scenario: Activar con un codigo invalido
- **WHEN** el codigo enviado no corresponde al secreto
- **THEN** el sistema responde con error y el segundo factor sigue desactivado

#### Scenario: El secreto nunca se expone en el perfil
- **WHEN** se consulta el usuario autenticado o el listado de administracion
- **THEN** la respuesta indica si el segundo factor esta activo
- **AND** NO contiene el secreto TOTP en ninguna forma

### Requirement: Verificacion del segundo factor en el inicio de sesion
Cuando un usuario con segundo factor activo presente credenciales correctas, el sistema
SHALL responder con un token de reto de un solo uso y vida limitada en lugar del par de
tokens, y SHALL emitir los tokens unicamente al canjear ese reto junto a un codigo valido.

#### Scenario: Credenciales correctas con segundo factor activo
- **WHEN** el usuario envia email y contrasena correctos
- **THEN** la respuesta indica que se requiere el segundo factor
- **AND** incluye un token de reto y su instante de caducidad
- **AND** NO incluye token de acceso ni de refresco

#### Scenario: Canjear el reto con un codigo valido
- **WHEN** se presenta el token de reto junto a un codigo TOTP valido
- **THEN** el sistema responde con el par de tokens
- **AND** el token de reto queda consumido

#### Scenario: El reto no se puede reutilizar
- **GIVEN** un token de reto ya canjeado
- **WHEN** se vuelve a presentar con un codigo valido
- **THEN** el sistema rechaza la peticion

#### Scenario: El reto caduca
- **GIVEN** un token de reto emitido hace mas tiempo del permitido
- **WHEN** se presenta con un codigo valido
- **THEN** el sistema rechaza la peticion

#### Scenario: Usuario sin segundo factor
- **WHEN** un usuario sin segundo factor activo envia credenciales correctas
- **THEN** recibe el par de tokens directamente, sin paso adicional

### Requirement: Los codigos incorrectos cuentan para el bloqueo de cuenta
El sistema SHALL tratar un codigo de segundo factor incorrecto como intento de acceso
fallido, aplicando el mismo contador y el mismo bloqueo que las contrasenas incorrectas, y
SHALL reiniciar ese contador cuando el codigo sea correcto.

#### Scenario: Codigo incorrecto suma al contador
- **WHEN** se presenta un reto valido con un codigo incorrecto
- **THEN** el contador de intentos fallidos del usuario aumenta

#### Scenario: Acumular fallos bloquea la cuenta
- **WHEN** los intentos fallidos alcanzan el umbral de bloqueo
- **THEN** la cuenta queda bloqueada igual que ante contrasenas incorrectas

#### Scenario: Un codigo correcto limpia el contador
- **WHEN** se presenta un codigo valido
- **THEN** el contador de intentos fallidos vuelve a cero

### Requirement: Codigos de recuperacion de un solo uso
El sistema SHALL entregar un conjunto de codigos de recuperacion al activar el segundo
factor, SHALL almacenarlos unicamente hasheados, y SHALL aceptar cada uno una sola vez como
sustituto del codigo TOTP.

#### Scenario: Los codigos se muestran una unica vez
- **WHEN** el usuario activa el segundo factor
- **THEN** recibe sus codigos de recuperacion en esa respuesta
- **AND** ninguna consulta posterior los devuelve en claro

#### Scenario: Entrar con un codigo de recuperacion
- **GIVEN** un usuario con el segundo factor activo
- **WHEN** canjea un reto usando un codigo de recuperacion no usado
- **THEN** el sistema responde con el par de tokens

#### Scenario: Un codigo de recuperacion no vale dos veces
- **GIVEN** un codigo de recuperacion ya canjeado
- **WHEN** se vuelve a presentar
- **THEN** el sistema lo rechaza

#### Scenario: Los codigos no se guardan en claro
- **WHEN** se inspecciona el almacenamiento de codigos de recuperacion
- **THEN** solo contiene sus hashes, nunca el valor entregado al usuario

### Requirement: Desactivacion del segundo factor
El sistema SHALL exigir contrasena **y** un codigo vigente para desactivar el segundo factor,
y SHALL eliminar el secreto y los codigos de recuperacion asociados al hacerlo.

#### Scenario: Desactivar aportando ambos factores
- **WHEN** el usuario envia su contrasena y un codigo valido
- **THEN** el segundo factor queda desactivado
- **AND** el secreto y los codigos de recuperacion se eliminan

#### Scenario: No basta con la sesion iniciada
- **WHEN** se solicita la desactivacion sin contrasena o sin codigo valido
- **THEN** el sistema rechaza la peticion y el segundo factor sigue activo

### Requirement: El secreto se almacena cifrado
El sistema SHALL almacenar el secreto TOTP cifrado con una clave que no resida en la base de
datos, de forma que obtener el fichero de base de datos no permita generar codigos validos.

#### Scenario: El secreto no es legible en la base
- **WHEN** se inspecciona la fila del usuario en la base de datos
- **THEN** el valor almacenado no es el secreto utilizable por una aplicacion TOTP

#### Scenario: Un texto cifrado manipulado no se acepta
- **WHEN** el valor almacenado se altera
- **THEN** el descifrado falla de forma explicita, en lugar de devolver un secreto erroneo

### Requirement: Los administradores requieren segundo factor
El sistema SHALL denegar el acceso a las rutas de administracion a los usuarios con rol de
administrador que no tengan el segundo factor activo, con un motivo distinguible del de falta
de rol.

#### Scenario: Administrador sin segundo factor
- **GIVEN** un usuario con rol de administrador y sin segundo factor activo
- **WHEN** solicita cualquier ruta de administracion
- **THEN** el sistema responde 403 indicando que se requiere el segundo factor

#### Scenario: Administrador con segundo factor
- **GIVEN** un usuario con rol de administrador y segundo factor activo
- **WHEN** solicita una ruta de administracion
- **THEN** el sistema procesa la peticion con normalidad

#### Scenario: El resto de la aplicacion sigue accesible
- **GIVEN** un administrador sin segundo factor activo
- **WHEN** usa rutas que no son de administracion
- **THEN** el sistema las procesa con normalidad, para que pueda activar el segundo factor
