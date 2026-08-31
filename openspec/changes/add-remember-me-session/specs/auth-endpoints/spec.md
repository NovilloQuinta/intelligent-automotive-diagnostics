# Auth Endpoints

## Purpose

Endpoints de autenticación: registro de usuarios (individual y taller), login con JWT (access +
refresh tokens), y rotación de refresh tokens.

## MODIFIED Requirements

### Requirement: Login con JWT
El sistema SHALL autenticar usuarios por email y password, devolviendo access token (15 min) y
refresh token. La duración del refresh token SHALL depender del campo opcional `rememberMe` del
cuerpo de la petición: 7 días (`REFRESH_TOKEN_TTL`) cuando es `false` o no viene, y 30 días
(`REMEMBER_ME_REFRESH_TOKEN_TTL`) cuando es `true`. El access token SHALL durar 15 minutos en
ambos casos.

#### Scenario: Login exitoso sin recordar
- **WHEN** se envia `{ email: "juan@mail.com", password: "Pass1234!" }` con credenciales correctas
- **THEN** el sistema devuelve 200 con `{ accessToken, refreshToken }`
- **AND** el refresh token caduca a los 7 días
- **AND** la fila de `refresh_tokens` guarda esa misma caducidad

#### Scenario: Login exitoso recordando la sesión
- **WHEN** se envia `{ email: "juan@mail.com", password: "Pass1234!", rememberMe: true }`
- **THEN** el sistema devuelve 200 con `{ accessToken, refreshToken }`
- **AND** el refresh token caduca a los 30 días
- **AND** la fila de `refresh_tokens` guarda esa misma caducidad

#### Scenario: `rememberMe` ausente equivale a `false`
- **WHEN** se envia un login sin el campo `rememberMe`
- **THEN** el refresh token caduca a los 7 días

#### Scenario: `rememberMe` con un tipo que no es booleano
- **WHEN** se envia `{ email, password, rememberMe: "sí" }`
- **THEN** el sistema responde 400 con error de validación

#### Scenario: Password incorrecta
- **WHEN** se envia un password que no coincide con el hash almacenado
- **THEN** el sistema responde 401 con `{ error: "Invalid credentials" }`

#### Scenario: Email no registrado
- **WHEN** se envia un email que no existe en la BD
- **THEN** el sistema responde 401 con `{ error: "Invalid credentials" }`

### Requirement: Refresh de token
El sistema SHALL permitir renovar el access token usando un refresh token valido, rotando el
refresh token. La rotación SHALL conservar la duración de la sesión: un refresh token emitido
como recordado SHALL producir un refresh token nuevo también recordado y con los 30 días
completos, sin que el cliente tenga que volver a pedirlo.

#### Scenario: Refresh exitoso
- **WHEN** se envia un refresh token valido (no revocado, no expirado)
- **THEN** el sistema revoca el refresh token viejo, genera un nuevo par y devuelve 200 con `{ accessToken, refreshToken }`

#### Scenario: La rotación conserva la sesión recordada
- **GIVEN** un refresh token emitido con `rememberMe: true`
- **WHEN** se renueva
- **THEN** el refresh token nuevo vuelve a caducar a los 30 días
- **AND** una segunda rotación sigue devolviendo 30 días

#### Scenario: La rotación no promueve una sesión normal
- **GIVEN** un refresh token emitido sin `rememberMe`
- **WHEN** se renueva
- **THEN** el refresh token nuevo caduca a los 7 días

#### Scenario: Refresh token no encontrado
- **WHEN** se envia un refresh token cuyo hash no esta en la BD
- **THEN** el sistema responde 401 con `{ error: "Invalid refresh token" }`

#### Scenario: Refresh token revocado
- **WHEN** se envia un refresh token que ya fue revocado
- **THEN** el sistema responde 401 con `{ error: "Invalid refresh token" }`

## ADDED Requirements

### Requirement: Configuración de la duración de la sesión recordada
El sistema SHALL leer la duración del refresh token recordado de la variable de entorno
`REMEMBER_ME_REFRESH_TOKEN_TTL`, en segundos, con 2 592 000 (30 días) por defecto. El arranque
SHALL fallar con un error explícito si ese valor es menor que `REFRESH_TOKEN_TTL`, porque en esa
combinación marcar "Recordarme" acortaría la sesión en vez de alargarla.

#### Scenario: Valor por defecto
- **WHEN** el entorno no define `REMEMBER_ME_REFRESH_TOKEN_TTL`
- **THEN** el sistema arranca y usa 2 592 000 segundos para las sesiones recordadas

#### Scenario: Valor menor que el TTL normal
- **GIVEN** `REFRESH_TOKEN_TTL=604800`
- **WHEN** se arranca con `REMEMBER_ME_REFRESH_TOKEN_TTL=3600`
- **THEN** el arranque falla con un error que nombra ambas variables

#### Scenario: Valor no numérico o no positivo
- **WHEN** se arranca con `REMEMBER_ME_REFRESH_TOKEN_TTL=0` o con un texto
- **THEN** el arranque falla con error de validación
