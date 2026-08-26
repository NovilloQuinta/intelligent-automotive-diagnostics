## 0. Preparacion

- [ ] 0.1 Baseline en verde (`pnpm test`) y rama comprobada con `git branch --show-current`
- [ ] 0.2 Instalar `otplib` y `qrcode` (+ `@types/qrcode`) en `apps/core-api`
- [ ] 0.3 Contexto: `LoginUserUseCase`, `authService.ts`, `admin.middleware.ts`,
      `passwordResetTokenRepository.ts`, `safeUser.ts`, `openapiSync.test.ts`

## 1. Dominio: reglas TOTP y codigos de recuperacion

### 1.1 RED — `domain/twoFactor.test.ts`
Constantes RFC 6238 del proyecto (6 digitos, 30 s, ventana +/-1, SHA-1);
`buildOtpauthUri({ issuer, account, secret })` con escapado correcto; `generateRecoveryCodes()`
devuelve 10 codigos distintos con el formato acordado; `normalizeTwoFactorCode()` tolera
espacios, guiones y minusculas.

### 1.2 GREEN — `src/domain/twoFactor.ts`
Logica pura, sin dependencias. No conoce `otplib`.

## 2. Puertos y adaptadores

### 2.1 RED — `AesGcmSecretCipher.test.ts`
Ida y vuelta; dos cifrados del mismo texto dan ciphertext distinto (IV aleatorio); manipular
el ciphertext hace fallar el descifrado en vez de devolver basura; clave de longitud
incorrecta falla al construir.

### 2.2 GREEN — `SecretCipherPort` + `infrastructure/security/AesGcmSecretCipher.ts`
AES-256-GCM con `node:crypto`. Clave de 32 bytes en base64.

### 2.3 RED — `OtplibTotpAdapter.test.ts`
`verify` acepta el codigo del instante actual y el del paso anterior/siguiente, y rechaza uno
de dos pasos atras. Con `vi.setSystemTime`, sin depender del reloj real.

### 2.4 GREEN — `TotpPort` + `infrastructure/security/OtplibTotpAdapter.ts`
Unico fichero que importa `otplib` y `qrcode`.

### 2.5 GREEN — `TOTP_ENCRYPTION_KEY` en el schema Zod y en `.env.example`

## 3. Persistencia

### 3.1 RED — tests de los dos repositorios nuevos
Reto: guardar, buscar por hash, marcar usado, rechazar caducado. Codigos: guardar el lote,
canjear uno, rechazar el segundo canje, borrar todos los de un usuario.

### 3.2 GREEN — schema + migracion generada (`pnpm db:generate` -> `0008`)
`users`: `two_factor_secret TEXT NULL`, `two_factor_enabled INTEGER NOT NULL DEFAULT 0`.
Tablas `two_factor_challenges` y `two_factor_recovery_codes`.

### 3.3 GREEN — repositorios y metodos nuevos de `UserRepository`
`findTwoFactorSecret`, `saveTwoFactorSecret`, `setTwoFactorEnabled`.

### 3.4 RED/GREEN — `toSafeUser` no deja salir secretos
Test que falla si la proyeccion publica incluye cualquier clave que contenga `secret`.
`User` gana solo `twoFactorEnabled`.

## 4. Casos de uso

### 4.1 RED/GREEN — `SetupTwoFactorUseCase`
Genera secreto, lo cifra, lo guarda **sin** activar, devuelve URI + QR.

### 4.2 RED/GREEN — `ActivateTwoFactorUseCase`
Codigo valido -> activa y devuelve los 10 codigos. Codigo invalido -> error, sigue inactivo.

### 4.3 RED/GREEN — `LoginUserUseCase` devuelve reto si hay 2FA
Sin 2FA, comportamiento identico al de hoy (los tests existentes deben pasar sin tocarse).

### 4.4 RED/GREEN — `VerifyTwoFactorUseCase`
Reto valido + TOTP -> tokens. Reto valido + codigo de recuperacion -> tokens, y ese codigo
queda quemado. Reto usado o caducado -> error. Codigo malo -> `incrementFailedLogin`;
codigo bueno -> `resetFailedLogins`.

### 4.5 RED/GREEN — `DisableTwoFactorUseCase`
Exige contrasena **y** codigo vigente; borra secreto y codigos de recuperacion.

## 5. HTTP

### 5.1 RED/GREEN — controladores y rutas
`POST /api/auth/2fa/verify`; `POST /api/profile/2fa/{setup,activate,disable}`.
`Cache-Control: no-store` en la respuesta de `setup`.

### 5.2 GREEN — limitador propio para `2fa/verify`
`createRateLimiter({ namespace: 'auth:2fa-verify', windowMinutes: 1, maxRequests: 5 })`.

### 5.3 GREEN — OpenAPI
Operaciones en `openapi/routes/auth.ts` y contratos en `openapi/contracts/auth.ts`.
**`openapiSync.test.ts` falla si falta alguna**: es la comprobacion de que estan las cuatro.

### 5.4 RED/GREEN — `requireAdmin` exige 2FA
403 con motivo propio, distinguible del 403 de rol. Rutas no-admin siguen accesibles.

### 5.5 RED/GREEN — el secreto no aparece en los logs
`Logger` persiste el `context` en la tabla `logs`: test que falle si un caso de uso de 2FA
mete el secreto ahi, al estilo del que ya evita el email en `auth.login_failed`.

## 6. UI

### 6.1 RED/GREEN — `lib/api.ts` y `apiTypes.ts`
Los cuatro metodos y sus tipos. `login` pasa a devolver tokens **o** reto.

### 6.2 RED/GREEN — `routes/login.tsx`
Paso `awaiting-2fa`. Un campo, acepta TOTP o codigo de recuperacion.

### 6.3 RED/GREEN — `routes/profile.tsx`
Pestana **Seguridad**: QR + alta, codigos de recuperacion una sola vez con aviso, desactivar.

## 7. Cierre

- [ ] 7.1 `pnpm verify` en verde
- [ ] 7.2 `pnpm test:coverage` sin bajar ningun umbral (los ficheros nuevos no estan excluidos)
- [ ] 7.3 Prueba manual con una app TOTP real (Aegis / Google Authenticator)
- [ ] 7.4 `docs/security.md`: cerrar el residual 2; anotar el cifrado del secreto en el 3;
      filas A02/A07 y API2
- [ ] 7.5 `docs/deuda-conocida.md`: **re-medir**, no estimar
- [ ] 7.6 `docs/estado-actual.md`: max 15 lineas, y avisar de la ruptura para administradores
- [ ] 7.7 Avisar del bullet de la slide 17 (`'La ausencia de MFA'`), que vive fuera de `develop`
