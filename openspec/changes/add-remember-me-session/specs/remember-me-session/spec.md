# Remember Me Session

## Purpose

Deja que el usuario decida en el login si su sesión sobrevive al cierre del navegador. De esa
decisión dependen dónde se guardan los tokens en el cliente y cuánto vive el refresh token. La
contraseña no se guarda en ningún caso: lo que se recuerda es la sesión y el email.

## ADDED Requirements

### Requirement: Casilla "Recordarme" en el formulario de login
La pantalla de login SHALL ofrecer una casilla de sesión recordada, etiquetada de forma que diga
qué hace, marcada por defecto en la primera visita y reflejando la última elección del usuario en
las siguientes. El valor de la casilla SHALL viajar como `rememberMe` en `POST /api/auth/login`.

#### Scenario: Primera visita
- **WHEN** un usuario abre la pantalla de login sin haber elegido nunca
- **THEN** la casilla "Mantener la sesión iniciada en este dispositivo" aparece marcada

#### Scenario: La elección se recuerda
- **GIVEN** un usuario que inició sesión con la casilla desmarcada
- **WHEN** vuelve a la pantalla de login
- **THEN** la casilla aparece desmarcada

#### Scenario: El valor llega al servidor
- **WHEN** se envía el formulario con la casilla marcada
- **THEN** el cuerpo de `POST /api/auth/login` incluye `rememberMe: true`

#### Scenario: La casilla no aparece en el registro ni en el segundo factor
- **WHEN** se muestra la pestaña de registro o el paso del código de verificación
- **THEN** no se pinta ninguna casilla de sesión recordada
- **AND** el segundo factor hereda la elección hecha en el primer paso

### Requirement: El almacén de los tokens depende de la elección
El cliente SHALL guardar el par de tokens en `localStorage` cuando la sesión es recordada y en
`sessionStorage` cuando no lo es. La lectura SHALL mirar primero `localStorage` y después
`sessionStorage`; el borrado SHALL limpiar los dos. La renovación de tokens SHALL reescribir en el
mismo almacén del que salió el token que se renueva.

#### Scenario: Sesión recordada
- **WHEN** el login se resuelve con la casilla marcada
- **THEN** `accessToken` y `refreshToken` quedan en `localStorage`
- **AND** `sessionStorage` no contiene ningún token

#### Scenario: Sesión de una sola visita
- **WHEN** el login se resuelve con la casilla desmarcada
- **THEN** `accessToken` y `refreshToken` quedan en `sessionStorage`
- **AND** `localStorage` no contiene ningún token
- **AND** al cerrar la pestaña la sesión desaparece sin dejar rastro

#### Scenario: La renovación no promueve la sesión
- **GIVEN** unos tokens guardados en `sessionStorage`
- **WHEN** una petición recibe 401 y el cliente renueva el token
- **THEN** el par nuevo se escribe en `sessionStorage`
- **AND** `localStorage` sigue sin contener tokens

#### Scenario: Cierre de sesión
- **WHEN** el usuario cierra sesión
- **THEN** no quedan tokens ni en `localStorage` ni en `sessionStorage`

#### Scenario: El almacenamiento no está disponible
- **WHEN** el navegador rechaza escribir en el almacén elegido
- **THEN** la aplicación no rompe la navegación en curso

### Requirement: Se recuerda el email, nunca la contraseña
El sistema SHALL guardar en el cliente el email del último inicio de sesión correcto cuando la
sesión es recordada, y SHALL usarlo para prerrellenar el campo de email en la siguiente visita. La
contraseña NO SHALL guardarse en ningún almacén del cliente ni del servidor en forma recuperable;
el autorrelleno queda en manos del gestor de contraseñas del navegador, para el que el formulario
mantiene `autocomplete="email"` y `autocomplete="current-password"`.

#### Scenario: Email prerrellenado
- **GIVEN** un login correcto anterior con la casilla marcada
- **WHEN** el usuario vuelve a la pantalla de login
- **THEN** el campo de email aparece con su email
- **AND** el campo de contraseña aparece vacío

#### Scenario: Sin recordar no se guarda el email
- **WHEN** el login se resuelve con la casilla desmarcada
- **THEN** no queda ningún email guardado
- **AND** un email guardado antes se borra

#### Scenario: La contraseña nunca se persiste
- **WHEN** se completa cualquier inicio de sesión
- **THEN** ni `localStorage` ni `sessionStorage` contienen la contraseña
