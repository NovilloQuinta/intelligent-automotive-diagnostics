# Rate Limiting

## Purpose

Rate limiting por IP con headers estándar (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) y configuración inyectable vía `ServerConfig`.

## Requirements

### Requirement: Rate limiting por IP
El sistema SHALL limitar las peticiones HTTP a 100 por ventana de 15 minutos por direccion IP, respondiendo con codigo 429 cuando se excede el limite.

#### Scenario: Peticion dentro del limite
- **WHEN** un cliente realiza menos de 100 peticiones en 15 minutos desde la misma IP
- **THEN** el sistema procesa la peticion normalmente

#### Scenario: Peticion que excede el limite
- **WHEN** un cliente realiza mas de 100 peticiones en 15 minutos desde la misma IP
- **THEN** el sistema responde con HTTP 429 y el body contiene un mensaje de error

### Requirement: Headers RateLimit estandar
El sistema SHALL incluir los headers `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset` en cada respuesta, indicando el estado actual del rate limit.

#### Scenario: Headers presentes en respuesta exitosa
- **WHEN** un cliente hace una peticion valida dentro del limite
- **THEN** la respuesta incluye los headers `RateLimit-Limit`, `RateLimit-Remaining` y `RateLimit-Reset`

#### Scenario: Headers presentes en respuesta 429
- **WHEN** un cliente excede el limite de peticiones
- **THEN** la respuesta 429 incluye el header `Retry-After` indicando los segundos restantes

### Requirement: Rate limit configurable
El sistema SHALL permitir configurar la ventana de tiempo y el maximo de peticiones via `ServerConfig` al crear el servidor.

#### Scenario: Configuracion por defecto
- **WHEN** no se especifica configuracion de rate limit en `ServerConfig`
- **THEN** el sistema usa los valores por defecto (100 peticiones, 15 minutos)

#### Scenario: Configuracion personalizada
- **WHEN** se especifica `rateLimit.maxRequests` y `rateLimit.windowMinutes` en `ServerConfig`
- **THEN** el sistema aplica esos valores al middleware de rate limiting
