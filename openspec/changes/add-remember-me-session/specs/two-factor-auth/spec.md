# Two-Factor Authentication

## Purpose

Segundo factor TOTP (RFC 6238) opcional por usuario y obligatorio para administradores, con
codigos de recuperacion de un solo uso para no convertir la perdida del dispositivo en la
perdida de la cuenta.

## MODIFIED Requirements

### Requirement: Verificacion del segundo factor en el inicio de sesion
Cuando un usuario con segundo factor activo presente credenciales correctas, el sistema
SHALL responder con un token de reto de un solo uso y vida limitada en lugar del par de
tokens, y SHALL emitir los tokens unicamente al canjear ese reto junto a un codigo valido.
El reto SHALL conservar la elección de sesión recordada hecha en el primer factor, y el canje
SHALL emitir el refresh token con la duración que corresponda a esa elección sin volver a
preguntarla al cliente.

#### Scenario: Credenciales correctas con segundo factor activo
- **WHEN** el usuario envia email y contrasena correctos
- **THEN** la respuesta indica que se requiere el segundo factor
- **AND** incluye un token de reto y su instante de caducidad
- **AND** NO incluye token de acceso ni de refresco

#### Scenario: Canjear el reto con un codigo valido
- **WHEN** se presenta el token de reto junto a un codigo TOTP valido
- **THEN** el sistema responde con el par de tokens
- **AND** el token de reto queda consumido

#### Scenario: El reto emitido con "Recordarme" entrega una sesión larga
- **GIVEN** un login con `rememberMe: true` sobre una cuenta con segundo factor activo
- **WHEN** se canjea el reto con un codigo valido
- **THEN** el refresh token emitido caduca a los 30 días

#### Scenario: El reto emitido sin "Recordarme" entrega una sesión normal
- **GIVEN** un login sin `rememberMe` sobre una cuenta con segundo factor activo
- **WHEN** se canjea el reto con un codigo valido
- **THEN** el refresh token emitido caduca a los 7 días
- **AND** un `rememberMe` enviado en el cuerpo del canje no altera ese resultado

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
