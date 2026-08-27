## Why

La cuenta se protege hoy con un solo factor: la contrasena. El bloqueo por intentos fallidos
(5 fallos -> 15 min) frena la fuerza bruta, pero no hace nada contra el caso que de verdad
ocurre: **una contrasena que ya esta en manos de otro**. Filtrada en otro servicio y
reutilizada aqui, o pescada. Ahi no hay intentos fallidos que contar — se entra a la primera.

`/api/admin` agrava el problema: expone el listado completo de usuarios, los logs de
aplicacion y la auditoria de peticiones, todo detras de esa unica contrasena.

`docs/security.md` lo lleva escrito como riesgo residual 2. Hasta el 2026-08-26 lo hacia con
la etiqueta "out of TFM scope", que **nadie habia decidido**: aparecio en la documentacion y
se fue heredando. Al revisar los residuales uno a uno se retiro, y este change lo cierra.

## What Changes

- **TOTP (RFC 6238)** como segundo factor: alta con codigo QR, verificacion en el login y
  desactivacion desde el perfil. **Opcional** para el usuario corriente.
- **Obligatorio para administradores.** Un admin puede tener cuenta sin 2FA, pero `/api/admin`
  le responde 403 hasta que la active.
- **Login en dos pasos.** Con 2FA activa, `POST /api/auth/login` deja de devolver tokens:
  devuelve un token de reto de vida corta. El segundo paso es
  `POST /api/auth/2fa/verify`.
- **Codigos de recuperacion**: diez, de un solo uso, guardados hasheados y mostrados una
  unica vez. Sin ellos, perder el movil significa perder la cuenta.
- **El secreto TOTP se guarda cifrado** (AES-256-GCM, clave en `TOTP_ENCRYPTION_KEY`). No es
  un hash: es una llave, y quien la lea genera codigos validos indefinidamente.

## Capabilities

### Added Capabilities
- `two-factor-auth`: el usuario puede exigir un codigo temporal ademas de la contrasena, y
  recuperar el acceso con un codigo de un solo uso si pierde el dispositivo.

### Modified Capabilities
- `auth-endpoints`: `POST /api/auth/login` puede devolver un reto en lugar del par de tokens.
- `user-profile`: el perfil gana alta, baja y consulta del segundo factor.

## Dependencies

Entran dos dependencias en `apps/core-api`, ambas confinadas a infraestructura detras de
puertos: `otplib` (generacion y verificacion TOTP) y `qrcode` (render del QR a data-URI). El
cifrado usa `node:crypto`, sin dependencia nueva.

No depende de ningun change abierto. Se apoya en el store de rate limiting de
`2026-08-26-add-persistent-rate-limit-store`, ya integrado, para limitar `2fa/verify`.

## Impact

- **Nuevo**: `domain/twoFactor.ts`, `application/ports/{TotpPort,SecretCipherPort}.ts`,
  cuatro casos de uso, `infrastructure/security/{OtplibTotpAdapter,AesGcmSecretCipher}.ts`,
  dos repositorios SQLite, migracion `0008`
- **Modificado**: `LoginUserUseCase` (puede devolver reto), `UserRepository` y su
  implementacion, `admin.middleware.ts` (exige 2FA), `auth.routes.ts`, `profile.routes.ts`,
  `server.ts` (limitador de `2fa/verify`), OpenAPI, `configuration/index.ts`, `.env.example`
- **Modificado en UI**: `routes/login.tsx` (paso del codigo), `routes/profile.tsx` (pestana
  Seguridad), `lib/api.ts`, `lib/apiTypes.ts`
- **Fuera de este change**: cifrado completo de la base en reposo — es el residual 3, que
  quedo como decision abierta, no como algo asumido
