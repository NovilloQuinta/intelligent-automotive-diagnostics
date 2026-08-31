## Contexto

Estado actual del ciclo de sesión:

| Pieza | Hoy |
|---|---|
| `ACCESS_TOKEN_TTL` | 900 s (15 min), igual para todos |
| `REFRESH_TOKEN_TTL` | 604 800 s (7 días), igual para todos |
| Emisión | `authService.generateTokens(userId)` firma `{ sub, jti }` en ambos tokens |
| Rotación | `refreshAccessToken` revoca el viejo y emite uno nuevo, **siempre** con `REFRESH_TOKEN_TTL` |
| Persistencia en cliente | `apiClient.setTokens()` escribe siempre en `localStorage` |
| Segundo factor | El login emite un reto opaco (hash en `two_factor_challenges`); `POST /api/auth/2fa/verify` lo canjea por tokens |

El formulario de login ya lleva `autocomplete="email"` y `autocomplete="current-password"`: el
gestor del navegador puede ofrecer y rellenar la contraseña. Lo que falta no es autorrelleno, es
que la sesión dure lo suficiente como para no llegar al formulario.

## Goals / Non-Goals

**Goals:**
- El usuario elige en el login cuánto quiere que dure su sesión, con una sola casilla.
- La elección se respeta hasta el final: en la rotación del refresh y al otro lado del segundo factor.
- Sin "recordarme" el rastro es menor que hoy: los tokens mueren con la pestaña.
- Cero dependencias nuevas y cero cambios en el middleware de autenticación.

**Non-Goals:**
- **No se guarda la contraseña** en ningún almacén, ni cifrada (Decisión 1).
- No se implementa "confiar en este dispositivo" para saltarse el segundo factor: recordar la
  sesión alarga el refresh token, no elimina un factor.
- No se añade gestión de sesiones activas ("cerrar sesión en todos los dispositivos"): el
  `refresh_tokens` ya guarda un registro por sesión, pero la pantalla queda fuera de alcance.
- No se tocan `ACCESS_TOKEN_TTL` ni el bloqueo por intentos fallidos.
- No se migran las sesiones ya abiertas: siguen con sus 7 días hasta que caducan.

## Decisiones

### Decisión 1: sesión recordada, contraseña nunca

**Elegido**: no persistir la contraseña en ninguna forma. La casilla alarga la sesión y recuerda
el email; el autorrelleno lo sigue haciendo el gestor del navegador.

**Alternativas descartadas**:
- *Guardar la contraseña en `localStorage`* (en claro o "ofuscada"): cualquier XSS se la lleva, y
  el cifrado en cliente no protege de nada porque la clave viaja al lado del dato.
- *Guardarla cifrada en el servidor y devolverla*: convierte un hash bcrypt irreversible en un
  secreto recuperable. Es exactamente lo que el hasheo existe para evitar.

El usuario pidió "no volver a teclear la contraseña". Eso se cumple; lo que no se hace es
almacenarla.

### Decisión 2: la elección viaja en el refresh token (claim `rme`), no en una tabla

**Elegido**: `generateTokens(userId, rememberMe)` añade `rme: true` al **refresh** token cuando la
sesión es recordada. `refreshAccessToken` lee el claim del token presentado y lo propaga al par
nuevo, junto con el TTL largo.

**Por qué**: la rotación es el punto donde esto se rompe solo. Si la duración se decidiera nada más
que en el login, la primera renovación —a los 15 minutos— volvería a poner 7 días y el usuario se
encontraría fuera al octavo día habiendo pedido 30, sin ningún error visible. El claim va firmado:
el cliente no puede levantarse el TTL, y no hace falta una consulta más por renovación.

**Alternativas descartadas**:
- *Columna `remember_me` en `refresh_tokens`*: funciona, pero añade una lectura por rotación y una
  migración para un dato que ya cabe, firmado, dentro del propio token.
- *Deducir el TTL del `expiresAt` restante*: cada rotación arrastraría el error de la anterior y la
  ventana se iría encogiendo.

`jwtPayloadSchema` pasa a `{ sub, rme: z.boolean().optional() }`. Sigue siendo un `z.object`, que
descarta claves desconocidas: un access token con `rme` no gana nada, porque el access token nunca
lo lleva y su TTL no depende de él.

### Decisión 3: el reto del segundo factor guarda la elección en la base

**Elegido**: columna `remember_me` en `two_factor_challenges` (migración `0009`). El login la
escribe al emitir el reto; `VerifyTwoFactorUseCase` la lee al canjearlo.

**Alternativa descartada**: *aceptar `rememberMe` otra vez en el cuerpo de `/api/auth/2fa/verify`*.
Es una petición menos invasiva, pero deja que el segundo paso contradiga al primero: el servidor
tendría dos respuestas distintas a la misma pregunta y ninguna razón para preferir una. La columna
mantiene una única fuente de verdad —lo que el usuario marcó cuando dio su contraseña— y el reto ya
es una fila que se escribe y se lee en ese mismo flujo, así que no añade ni una consulta.

### Decisión 4: `localStorage` con casilla, `sessionStorage` sin ella

**Elegido**: `setTokens(tokens, { persist })`. Con `persist` los tokens van a `localStorage`; sin
él, a `sessionStorage`. `getTokens()` mira primero `localStorage` y luego `sessionStorage`;
`clearTokens()` borra en los dos. La renovación reescribe en el mismo almacén del que salió el
token, para no promover una sesión de pestaña a sesión persistente por la puerta de atrás.

**Por qué no una cookie `HttpOnly`**, que sería más resistente a XSS: hoy toda la SPA lee el access
token de `localStorage` para poner la cabecera `Authorization`, y el backend no monta CSRF. Pasar a
cookies es un cambio de arquitectura de autenticación entero —y merece su propio change—, no un
efecto colateral de una casilla. Este cambio deja el rastro **más pequeño** que hoy en el caso sin
recordar, que es la dirección correcta aunque no sea el final del camino.

### Decisión 5: la casilla viene marcada por defecto

**Elegido**: `defaultChecked`, y la elección anterior del usuario manda en las visitas siguientes.

**Por qué**: el cambio existe para que la gente deje de teclear la contraseña; con la casilla
desmarcada por defecto habría que descubrirla para obtener el beneficio. Y no empeora el estado
actual: hoy **todas** las sesiones se guardan en `localStorage` sin preguntar y duran 7 días. Con
esto, el que la desmarca obtiene algo que hoy no puede tener —una sesión que muere con la pestaña—.

**Coste asumido**: en un ordenador compartido, quien no lea la casilla deja una sesión de 30 días
en vez de una de 7. Se mitiga con la etiqueta ("Mantener la sesión iniciada en este dispositivo") y
con el cierre de sesión, que revoca el refresh token en el servidor.

### Decisión 6: `REMEMBER_ME_REFRESH_TOKEN_TTL`, 30 días por defecto

Variable propia en vez de un multiplicador de `REFRESH_TOKEN_TTL`, para que el operador pueda
mover una sin arrastrar la otra. Por defecto 2 592 000 s. La configuración rechaza al arrancar un
valor **menor** que `REFRESH_TOKEN_TTL`: en esa combinación "recordarme" acortaría la sesión, que
es lo contrario de lo que la casilla promete, y es un error de despliegue silencioso.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un refresh token robado vale ahora 30 días en vez de 7 | El robo ya era terminal a 7 días; el cierre de sesión revoca el token en la base y la rotación detecta el reuso |
| La casilla marcada por defecto en un ordenador prestado | Etiqueta explícita + logout que revoca en servidor |
| La migración `0009` no llega al VPS | La columna lleva `DEFAULT 0 NOT NULL`: sin aplicarla el login con 2FA fallaría al escribir, así que entra en la lista de comprobación del despliegue |
| El email recordado en un equipo compartido | Es un email, no una credencial; se borra al desmarcar la casilla en el siguiente login |
