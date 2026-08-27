# Rate Limiting

## Purpose

Rate limiting por IP con headers estándar (`RateLimit-Limit`, `RateLimit-Remaining`,
`RateLimit-Reset`), contador **persistido en SQLite** —para que reiniciar el proceso no
devuelva al cliente su cuota completa— y un namespace por limitador, de modo que agotar una
familia de rutas no consuma la cuota de otra.

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

### Requirement: El contador de peticiones sobrevive al reinicio
El sistema SHALL persistir el contador de peticiones de cada cliente en SQLite, de forma que
reiniciar el proceso NO devuelva al cliente su cuota completa. El contador SHALL seguir
vigente hasta que caduque su ventana, con independencia de cuantas veces se haya recreado el
middleware o reiniciado el proceso entre medias.

#### Scenario: El contador sigue vigente tras recrear el middleware
- **GIVEN** un limitador de 5 peticiones por minuto sobre una base de datos concreta
- **WHEN** un cliente consume sus 5 peticiones
- **AND** el middleware se destruye y se vuelve a crear con el mismo namespace sobre la misma base
- **THEN** la siguiente peticion de ese cliente responde 429
- **AND** NO se le concede una ventana nueva

#### Scenario: La ventana caducada si devuelve la cuota
- **GIVEN** un cliente que agoto su limite
- **WHEN** ha pasado la ventana completa desde su primera peticion
- **THEN** su contador vuelve a empezar en 1 y la peticion se procesa

#### Scenario: Las ventanas caducadas no se acumulan en la tabla
- **WHEN** se registra una peticion nueva
- **THEN** el sistema elimina las filas cuya ventana ya vencio
- **AND** la tabla no crece de forma indefinida con clientes que dejaron de pedir

### Requirement: Cada limitador cuenta en su propio espacio de claves
El sistema SHALL identificar cada limitador con un namespace propio, de modo que agotar el
limite de una familia de rutas NO consuma el de otra para el mismo cliente. La clave de
contador SHALL ser el par (namespace, identificador de cliente).

#### Scenario: Agotar un limitador no agota los demas
- **GIVEN** un cliente que agoto el limite de `/api/admin` (30/min)
- **WHEN** ese mismo cliente hace una peticion a `/api/diagnosis` (20/min)
- **THEN** la peticion se procesa con normalidad

#### Scenario: Dos limitadores con la misma ventana y limite no se pisan
- **GIVEN** dos limitadores distintos configurados ambos a 5 peticiones por minuto
- **AND** cada uno declara su propio namespace
- **WHEN** un cliente agota el primero
- **THEN** el segundo sigue con su cuota intacta para ese cliente

### Requirement: Activacion explicita del rate limiting
El sistema SHALL decidir si aplica rate limiting a partir de la variable `RATE_LIMIT_ENABLED`.
Cuando la variable no este definida, el sistema SHALL aplicar rate limiting solo si
`NODE_ENV` es `production`. Cuando este definida, su valor SHALL prevalecer sobre `NODE_ENV`.

#### Scenario: Sin la variable, solo limita en produccion
- **WHEN** `RATE_LIMIT_ENABLED` no esta definida y `NODE_ENV` es `production`
- **THEN** el middleware aplica el limite
- **WHEN** `RATE_LIMIT_ENABLED` no esta definida y `NODE_ENV` no es `production`
- **THEN** el middleware deja pasar toda peticion

#### Scenario: La variable manda sobre NODE_ENV
- **WHEN** `RATE_LIMIT_ENABLED` vale `true` y `NODE_ENV` es `development`
- **THEN** el middleware aplica el limite
- **WHEN** `RATE_LIMIT_ENABLED` vale `false` y `NODE_ENV` es `production`
- **THEN** el middleware deja pasar toda peticion

### Requirement: Rate limit configurable
El sistema SHALL permitir configurar la ventana de tiempo, el maximo de peticiones y el
namespace via `Partial<RateLimiterConfig>` al crear el limitador. La firma de
`createRateLimiter` SHALL seguir aceptando un unico argumento opcional, de forma que los
llamantes existentes no requieran cambios para compilar.

#### Scenario: Configuracion por defecto
- **WHEN** no se especifica configuracion de rate limit
- **THEN** el sistema usa los valores por defecto (100 peticiones, 15 minutos)
- **AND** el namespace por defecto se deriva de la ventana y el limite, de forma estable entre reinicios

#### Scenario: Configuracion personalizada
- **WHEN** se especifica `windowMinutes`, `maxRequests` y `namespace`
- **THEN** el sistema aplica esos valores al middleware de rate limiting
