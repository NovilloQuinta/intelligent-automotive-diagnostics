## ADDED Requirements

### Requirement: Proteccion de rutas con JWT
El sistema SHALL verificar el token JWT del header `Authorization: Bearer <token>` antes de permitir el acceso a los endpoints de diagnostico.

#### Scenario: Token valido permite el acceso
- **WHEN** se envia una peticion con header `Authorization: Bearer <token_valido>` a un endpoint protegido
- **THEN** el middleware extrae el userId del token, lo asigna a `req.userId` y llama a `next()`

#### Scenario: Sin header Authorization
- **WHEN** se envia una peticion sin header Authorization a un endpoint protegido
- **THEN** el sistema responde 401 con `{ error: "Access token required" }`

#### Scenario: Token malformado
- **WHEN** se envia un header `Authorization: Bearer not.a.valid.jwt`
- **THEN** el sistema responde 401 con `{ error: "Invalid access token" }`

#### Scenario: Token expirado
- **WHEN** se envia un JWT que ha expirado (iat + 15min en el pasado)
- **THEN** el sistema responde 401 con `{ error: "Access token expired" }`

#### Scenario: Token firmado con otro secret
- **WHEN** se envia un JWT firmado con un secret diferente al del servidor
- **THEN** el sistema responde 401 con `{ error: "Invalid access token" }`

### Requirement: Rutas publicas excluidas del middleware
El sistema SHALL permitir acceso sin autenticacion a las rutas de auth y documentacion.

#### Scenario: Registro accesible sin token
- **WHEN** se envia POST a `/api/auth/register` sin token
- **THEN** el sistema procesa la peticion normalmente (no devuelve 401)

#### Scenario: Swagger accesible sin token
- **WHEN** se envia GET a `/api-docs` sin token
- **THEN** el sistema devuelve la pagina de Swagger (no 401)
