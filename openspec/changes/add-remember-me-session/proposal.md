## Why

Hoy el login no ofrece ninguna forma de decir "este es mi ordenador, no me vuelvas a pedir la
contraseña". La sesión dura lo que dure el refresh token —`REFRESH_TOKEN_TTL`, 7 días— y esa
decisión la toma el servidor por todo el mundo por igual: el mecánico que abre la aplicación cada
mañana en el portátil del taller vuelve a teclear la contraseña cada semana, y el que entra desde
el ordenador de un cliente deja una sesión viva de 7 días en `localStorage` sin haberlo pedido.

Las dos mitades del problema son la misma decisión sin tomar: **nadie pregunta al usuario cuánto
quiere que dure su sesión**. Al que quiere quedarse dentro se le echa pronto; al que sólo pasaba
por allí se le retiene demasiado.

La petición original era "recordar la contraseña". Lo que se implementa **no** guarda la
contraseña en ninguna parte (ver design.md, Decisión 1): guardar una contraseña recuperable —en
`localStorage`, en una cookie o cifrada en la base— convierte cualquier XSS o cualquier volcado de
disco en una fuga de credenciales, y el efecto que el usuario quiere (no volver a teclearla) se
consigue igual con una sesión recordada. El autorrelleno del gestor del navegador ya funciona: el
formulario tiene `autocomplete="email"` y `autocomplete="current-password"` desde el principio.

## What Changes

- **Casilla "Recordarme" en el formulario de login**, marcada por defecto. Es la única entrada
  nueva de usuario en todo el cambio.
- **`POST /api/auth/login` acepta `rememberMe`** (booleano opcional, `false` si no viene). Con
  `true` el refresh token se emite con `REMEMBER_ME_REFRESH_TOKEN_TTL` (30 días por defecto) en
  vez de `REFRESH_TOKEN_TTL` (7 días). El access token no cambia: sigue durando 15 minutos.
- **La elección sobrevive a la rotación del refresh token**: el refresh token recordado lleva el
  claim firmado `rme: true`, y `refreshAccessToken` lo propaga al token nuevo. Sin esto la primera
  rotación devolvería la sesión a 7 días y la promesa de 30 se rompería en silencio.
- **El segundo factor conserva la elección**: `two_factor_challenges` gana la columna `remember_me`
  (migración `0009`). El reto se emite en el login —que es donde el usuario marcó la casilla— y se
  canjea en `POST /api/auth/2fa/verify`, que no vuelve a preguntar: lee lo que decidió el usuario.
- **El cliente guarda los tokens donde toca**: con "Recordarme" en `localStorage` (comportamiento
  actual); sin él, en `sessionStorage`, y la sesión muere al cerrar la pestaña. Hoy todo va a
  `localStorage` sin preguntar.
- **Se recuerda el email, nunca la contraseña**: con la casilla marcada, el email del último login
  correcto vuelve relleno en la siguiente visita, que es lo que dispara el autorrelleno del gestor
  del navegador.

## Capabilities

### Added Capabilities
- `remember-me-session`: el usuario elige en el login si su sesión sobrevive al cierre del
  navegador, y con ella dónde se guardan los tokens y cuánto vive el refresh token.

### Modified Capabilities
- `auth-endpoints`: `POST /api/auth/login` acepta `rememberMe`; el refresh conserva la duración
  elegida al rotar.
- `two-factor-auth`: el reto transporta la elección del primer factor hasta el canje.

## Dependencies

Ninguna. Sale de `main` tal cual está (`147ec79`).

## Impact

- **Modificado (core-api)**: `configuration/index.ts` (`REMEMBER_ME_REFRESH_TOKEN_TTL`),
  `services/authService.ts` (claim `rme`, TTL por sesión), `dto/auth/LoginUserInput.ts`,
  `use-cases/LoginUserUseCase.ts`, `use-cases/VerifyTwoFactorUseCase.ts`,
  `ports/AuthServicePort.ts`, `ports/TwoFactorChallengeRepository.ts`,
  `dto/auth/TwoFactorChallengeRecord.ts`, `persistence/sqlite/schema.ts`,
  `persistence/sqlite/twoFactorChallengeRepository.ts`, `composition/auth.ts`,
  `composition/twoFactor.ts`, `http/openapi/contracts/auth.ts`
- **Nuevo (core-api)**: `drizzle/0009_*.sql` — `ALTER TABLE two_factor_challenges ADD remember_me`
- **Modificado (ui)**: `lib/apiClient.ts` (almacenamiento elegible), `lib/api.ts`,
  `lib/auth-context.tsx`, `routes/login.tsx`, `components/dashboard/types.ts`
- **Nuevo (ui)**: `components/ui/checkbox.tsx` — casilla nativa estilada, sin dependencia nueva
- **Sin cambios**: middleware de autenticación, bloqueo por intentos fallidos, reseteo de
  contraseña, `ACCESS_TOKEN_TTL`
- **Configuración**: `.env.example` documenta `REMEMBER_ME_REFRESH_TOKEN_TTL`; sin ella el
  despliegue sigue funcionando con el valor por defecto (30 días)
