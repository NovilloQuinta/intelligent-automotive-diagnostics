## Contexto

El login actual (`LoginUserUseCase`) es lineal: busca al usuario, comprueba el bloqueo,
compara la contrasena con bcrypt, resetea el contador de fallos y devuelve el par de tokens.
El segundo factor tiene que meterse entre la comparacion y la emision de tokens **sin**
romper a quien no lo tenga activado.

Piezas del repositorio que este diseno reutiliza en vez de reinventar:

| Necesidad | Ya existe |
|---|---|
| Token de un solo uso, hasheado, con caducidad | `password_reset_tokens` + `SqlitePasswordResetTokenRepository` |
| Hash de token no-contrasena | `hashToken` (SHA-256) en `application/shared/hashToken.ts` |
| Contador de fallos y bloqueo | `incrementFailedLogin` / `resetFailedLogins` en `UserRepository` |
| Limitador con namespace propio | `createRateLimiter({ namespace })`, del change anterior |
| Proyeccion segura del usuario | `toSafeUser` en `application/shared/safeUser.ts` |

## Goals / Non-Goals

**Goals:**
- Segundo factor TOTP completo: alta, uso, recuperacion y baja.
- Que perder el movil no signifique perder la cuenta.
- Que el panel de administracion no dependa de un solo factor.
- Que el algoritmo y las reglas sean del dominio, y la libreria un detalle sustituible.

**Non-Goals:**
- No se implementa WebAuthn/passkeys ni 2FA por SMS o email.
- No se obliga la 2FA al usuario corriente.
- No se cifra la base entera en reposo (residual 3, decision abierta).
- No se tocan las reglas de bloqueo por intentos fallidos: se **reutilizan**.

## Decisiones

### Decision 1: el token de reto es opaco, no un JWT

**El hallazgo que lo fuerza.** `authService.verifyAccessToken` valida el payload asi:

```ts
const jwtPayloadSchema = z.object({ sub: z.number().int().positive() })
```

Zod **descarta por defecto las claves que no declara**. Un token de reto firmado con
`ACCESS_TOKEN_SECRET` y marcado con `purpose: '2fa_challenge'` pasaria ese `.parse` sin
inmutarse: `verifyAccessToken` leeria su `sub` y lo aceptaria como access token. El atacante
que supera el **primer** factor recibiria, en el propio cuerpo de la respuesta, algo que vale
como sesion completa. El segundo factor no existiria.

**Elegido**: token aleatorio de 32 bytes, devuelto en claro al cliente y guardado **hasheado**
(SHA-256, `hashToken`) en `two_factor_challenges`, con `expires_at` a 5 minutos y `used_at`
para el consumo unico. Es el patron exacto de `password_reset_tokens`, que ya esta escrito,
probado y entendido en este repositorio.

Ventaja adicional sobre el JWT: se puede **revocar**. Un JWT de 5 minutos vive 5 minutos
haga lo que haga el servidor.

**Descartado — firmar el reto con un secreto distinto**: resuelve la confusion de tipos, pero
anade una variable de entorno mas que gestionar y sigue sin poder revocarse.

### Decision 2: el secreto TOTP no entra en la entidad `User`

`toSafeUser` construye la proyeccion publica por **exclusion**:

```ts
const { passwordHash: _passwordHash, ...safeUser } = user
```

Todo campo nuevo de `User` viaja solo por estar ahi. Si el secreto TOTP fuese un campo de
`User`, aparecia en `GET /api/auth/me` y en el listado de `/api/admin/users` sin que nadie
escribiese una linea para exponerlo. Es un fallo de una palabra.

**Elegido**: `User` gana unicamente `twoFactorEnabled: boolean`, que si es seguro publicar
(la UI necesita saberlo). El secreto se lee por un metodo dedicado,
`UserRepository.findTwoFactorSecret(userId)`, que solo llaman los casos de uso de 2FA.

Se anade ademas un test que falla si `toSafeUser` deja salir cualquier clave que contenga
`secret`: la proteccion no puede depender de que nadie olvide esta decision.

### Decision 3: el secreto se guarda cifrado, no en claro

Un `passwordHash` de bcrypt es inutil para entrar: hay que romperlo. El secreto TOTP **es la
llave** — quien lo lee genera codigos validos para siempre, y el segundo factor deja de
existir en silencio.

**Elegido**: AES-256-GCM (`node:crypto`), IV aleatorio de 12 bytes por cifrado, tag de
autenticacion, todo serializado en la misma columna. Clave de 32 bytes en base64 desde
`TOTP_ENCRYPTION_KEY`, detras de `SecretCipherPort`.

**Que cierra y que no**, escrito sin adornos:

- **Cierra** que el fichero `.db` salga del servidor: un backup mal guardado, un `scp`, un
  volumen que acaba en una imagen. Sin la clave, esos bytes no generan codigos.
- **No cierra** que alguien ejecute codigo en el servidor: el proceso necesita la clave para
  funcionar, asi que quien es el proceso la tiene. Ni SQLCipher ni el cifrado de disco
  cambian eso; cerrarlo pide un HSM o un KMS, desproporcionado a esta escala.

Merece la pena igual: con el secreto filtrado el atacante **sigue necesitando la
contrasena**, asi que se vuelve al nivel de seguridad de hoy, no por debajo. Y la fuga es
reparable rotando secretos. Convierte un fallo catastrofico y silencioso en uno operativo.

### Decision 4: el alta es en dos fases

`setup` genera el secreto, lo guarda **con `two_factor_enabled` todavia a 0** y devuelve el
QR. `activate` exige un codigo valido y solo entonces enciende el flag y entrega los codigos
de recuperacion.

Sin esa segunda fase, un QR mal escaneado —o escaneado en un movil que luego se restaura—
deja la cuenta con 2FA activa y ningun generador capaz de producir el codigo. El usuario se
queda fuera por un fallo de la interfaz.

### Decision 5: codigos de recuperacion con SHA-256, no bcrypt

Bcrypt existe para estirar el coste de probar candidatos de un diccionario, porque las
contrasenas humanas tienen poca entropia. Los codigos de recuperacion los genera
`randomBytes`: no hay diccionario. SHA-256 (`hashToken`, el mismo que ya usan los tokens de
reseteo) basta, y evita meter un coste de bcrypt en el camino de login.

Diez codigos, mostrados **una sola vez** al activar — es el unico momento en que el servidor
conoce el texto plano—, cada uno con su `used_at`.

### Decision 6: fallar el segundo factor cuenta como intento fallido

`VerifyTwoFactorUseCase` llama a `incrementFailedLogin` cuando el codigo no es valido y a
`resetFailedLogins` cuando si lo es, igual que el login.

Sin esto, el segundo paso seria un oraculo de seis digitos con el rate limit como unico
freno. Con el bloqueo compartido, agotar el espacio exige ademas superar el primer factor
cada vez que la cuenta se desbloquea.

### Decision 7: admin sin 2FA no entra al panel

`requireAdmin` ya resuelve el rol contra la base en cada peticion, en vez de leerlo de un
claim, precisamente para que revocar surta efecto sin esperar a que caduque el token. Se
anade la comprobacion de `twoFactorEnabled` en el mismo sitio y por el mismo motivo: **403**
con un mensaje propio, distinguible del 403 de rol.

El admin sembrado por `seedAdminUser` nace sin 2FA: puede entrar en la aplicacion y darse de
alta el segundo factor, pero el panel le esta cerrado hasta que lo haga. Es deliberado — un
arranque que exigiese 2FA antes de poder configurarla no tendria salida.

## Riesgos

- **La hora del servidor.** TOTP compara ventanas de 30 s; un reloj desviado invalida codigos
  correctos. Se acepta una ventana de +/-1 paso (30 s a cada lado), que es lo habitual, y se
  deja escrito que el VPS necesita NTP.
- **Perder movil y codigos a la vez.** No hay auto-servicio: hace falta intervencion
  administrativa sobre la base. Documentado, no automatizado — un "desactivame la 2FA por
  email" seria una puerta trasera con otro nombre.

## Plan de migracion

Las dos tablas nuevas nacen vacias. Las dos columnas de `users` son nullable / con default,
asi que las cuentas existentes quedan con `two_factor_enabled = 0` y siguen entrando con un
solo factor. La unica ruptura es para administradores: al desplegar, el panel les pide activar
el segundo factor. Va dicho en el commit y en `docs/estado-actual.md`.
