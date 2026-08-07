# Auth Endpoints

## Purpose

Endpoints de autenticación: registro de usuarios (individual y taller), login con JWT (access + refresh tokens), y rotación de refresh tokens.

## Requirements

### Requirement: Registro de usuario individual
El sistema SHALL permitir registrar un usuario de tipo "individual" con username, email y password. La password se hashea con bcrypt (12 rounds) antes de almacenarse.

#### Scenario: Registro exitoso de usuario individual
- **WHEN** se envia `{ username: "juan", email: "juan@mail.com", password: "Pass1234!", userType: "individual" }`
- **THEN** el sistema crea el usuario, devuelve 201 con `{ user: { id, username, email, userType }, accessToken, refreshToken }`

#### Scenario: Email duplicado
- **WHEN** se intenta registrar un email que ya existe
- **THEN** el sistema responde 409 con `{ error: "Email already registered" }`

#### Scenario: Username duplicado
- **WHEN** se intenta registrar un username que ya existe
- **THEN** el sistema responde 409 con `{ error: "Username already taken" }`

### Requirement: Registro de taller
El sistema SHALL permitir registrar un usuario de tipo "workshop" con campos adicionales de negocio.

#### Scenario: Registro exitoso de taller
- **WHEN** se envia `{ username: "taller1", email: "taller@mail.com", password: "Pass1234!", userType: "workshop", businessName: "Talleres AutoFix", taxId: "B12345678", address: "Calle 123" }`
- **THEN** el sistema devuelve 201 con el usuario incluyendo businessName, taxId y address

### Requirement: Validacion de entrada con Zod
El sistema SHALL validar todos los campos de entrada con schemas Zod antes de procesar la peticion.

#### Scenario: Campos requeridos ausentes
- **WHEN** se envia `{ username: "juan" }` sin email ni password
- **THEN** el sistema responde 400 con detalles de los campos faltantes

#### Scenario: Email con formato invalido
- **WHEN** se envia un email sin formato valido (ej. "notanemail")
- **THEN** el sistema responde 400 con error de validacion

#### Scenario: Password demasiado corta
- **WHEN** se envia una password de menos de 8 caracteres
- **THEN** el sistema responde 400 con error de validacion

### Requirement: Login con JWT
El sistema SHALL autenticar usuarios por email y password, devolviendo access token (15 min) y refresh token (7 dias).

#### Scenario: Login exitoso
- **WHEN** se envia `{ email: "juan@mail.com", password: "Pass1234!" }` con credenciales correctas
- **THEN** el sistema devuelve 200 con `{ accessToken, refreshToken }`

#### Scenario: Password incorrecta
- **WHEN** se envia un password que no coincide con el hash almacenado
- **THEN** el sistema responde 401 con `{ error: "Invalid credentials" }`

#### Scenario: Email no registrado
- **WHEN** se envia un email que no existe en la BD
- **THEN** el sistema responde 401 con `{ error: "Invalid credentials" }`

### Requirement: Refresh de token
El sistema SHALL permitir renovar el access token usando un refresh token valido, rotando el refresh token.

#### Scenario: Refresh exitoso
- **WHEN** se envia un refresh token valido (no revocado, no expirado)
- **THEN** el sistema revoca el refresh token viejo, genera un nuevo par y devuelve 200 con `{ accessToken, refreshToken }`

#### Scenario: Refresh token no encontrado
- **WHEN** se envia un refresh token cuyo hash no esta en la BD
- **THEN** el sistema responde 401 con `{ error: "Invalid refresh token" }`

#### Scenario: Refresh token revocado
- **WHEN** se envia un refresh token que ya fue revocado
- **THEN** el sistema responde 401 con `{ error: "Invalid refresh token" }`
