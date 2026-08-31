## 0. Preparación *(hecho)*

- [x] 0.1 Worktree `.claude/worktrees/remember-me` con la rama de trabajo creada **desde `main`**
- [x] 0.2 Baseline: suite de core-api y de ui en verde antes de tocar nada (el gate completo `pnpm verify` se corre al cierre, tarea 7.1)
- [x] 0.3 Cargar contexto: `authService.ts`, `LoginUserUseCase.ts`, `VerifyTwoFactorUseCase.ts`, `configuration/index.ts`, `apiClient.ts`, `api.ts`, `auth-context.tsx`, `login.tsx`

## 1. Configuración — `REMEMBER_ME_REFRESH_TOKEN_TTL` *(hecho)*

### 1.1 RED — tests de configuración
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/configuration/*.test.ts`
- **Descripción**: valor por defecto 2 592 000; arranque que falla si el TTL recordado es menor que `REFRESH_TOKEN_TTL`; rechazo de 0 y de texto.

### 1.2 GREEN — añadir la variable
- **Archivos**: `apps/core-api/src/infrastructure/configuration/index.ts`, `.env.example`
- **Descripción**: `REMEMBER_ME_REFRESH_TOKEN_TTL` con `z.coerce.number().int().positive().default(2_592_000)` y la comprobación cruzada contra `REFRESH_TOKEN_TTL`.
- **Criterio**: los tests de 1.1 en verde; el resto de la suite de config sin tocar.

## 2. `authService` — claim `rme` y TTL por sesión *(hecho)*

### 2.1 RED — tests del servicio
- **Archivos**: `apps/core-api/tests/unit/infrastructure/services/authService.test.ts`
- **Descripción**: `generateTokens(id, true)` firma el refresh con `rme: true` y 30 días; sin el flag, 7 días y sin claim; el access token no lleva `rme` en ningún caso; `refreshAccessToken` de un token recordado devuelve otro recordado con 30 días y guarda esa caducidad; de uno normal, 7 días.

### 2.2 GREEN — implementar
- **Archivos**: `apps/core-api/src/infrastructure/services/authService.ts`, `apps/core-api/src/application/ports/AuthServicePort.ts`
- **Descripción**: `AuthServiceConfig` gana `rememberMeRefreshTokenExpiresIn`; `generateTokens(userId, rememberMe = false)`; `jwtPayloadSchema` acepta `rme` opcional; `refreshAccessToken` propaga el claim y elige el TTL.
- **Criterio**: tests de 2.1 en verde, tests previos del servicio sin cambios.

### 2.3 REFACTOR
- **Descripción**: una sola función que traduzca `rememberMe -> ttl`, sin ternarios repetidos en cada rama.

## 3. Login — `rememberMe` de extremo a extremo *(hecho)*

### 3.1 RED — tests del caso de uso
- **Archivos**: `apps/core-api/tests/unit/application/use-cases/loginUser*.test.ts`
- **Descripción**: con `rememberMe: true` se persiste el refresh con caducidad de 30 días; sin él, 7; el reto de segundo factor se guarda con la elección; un `rememberMe` no booleano es 400.

### 3.2 GREEN — implementar
- **Archivos**: `apps/core-api/src/application/dto/auth/LoginUserInput.ts`, `apps/core-api/src/application/use-cases/LoginUserUseCase.ts`
- **Descripción**: `rememberMe: z.boolean().optional().default(false)`; `LoginUserUseCaseOptions.rememberMeRefreshTokenTtlMs`; elección del TTL al persistir y paso del flag a `generateTokens`.

### 3.3 Contrato OpenAPI
- **Archivos**: `apps/core-api/src/infrastructure/http/openapi/contracts/auth.ts`
- **Descripción**: reflejar `rememberMe` en el contrato del login; `openapiSync.test.ts` debe seguir en verde.

## 4. Segundo factor — el reto recuerda la elección *(hecho)*

### 4.1 RED — tests de persistencia y canje
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/twoFactorChallengeRepository.test.ts`, `apps/core-api/tests/unit/application/use-cases/verifyTwoFactor*.test.ts`
- **Descripción**: `save(...)` guarda y `findByTokenHash(...)` devuelve `rememberMe`; el canje de un reto recordado emite 30 días y el de uno normal 7.

### 4.2 GREEN — columna y propagación
- **Archivos**: `schema.ts`, `drizzle/0009_*.sql`, `twoFactorChallengeRepository.ts`, `TwoFactorChallengeRepository.ts` (port), `TwoFactorChallengeRecord.ts`, `VerifyTwoFactorUseCase.ts`
- **Descripción**: columna `remember_me` con `DEFAULT 0 NOT NULL`, migración generada con `drizzle-kit`, y el caso de uso eligiendo TTL según el reto.

### 4.3 Composición
- **Archivos**: `composition/auth.ts`, `composition/twoFactor.ts`
- **Descripción**: cablear `rememberMeRefreshTokenTtlMs` en los dos casos de uso y en el servicio.

## 5. Cliente — almacén elegible y email recordado *(hecho)*

### 5.1 RED — tests del cliente HTTP
- **Archivos**: `apps/ui/tests/unit/lib/apiClient.test.ts`, `apps/ui/tests/unit/lib/api.test.ts`
- **Descripción**: `setTokens(t, { persist: true })` escribe en `localStorage` y `{ persist: false }` en `sessionStorage`; `getTokens` mira los dos; `clearTokens` limpia los dos; la renovación reescribe en el almacén de origen; `login` manda `rememberMe` en el cuerpo y guarda el email sólo si se recuerda.

### 5.2 GREEN — implementar
- **Archivos**: `apps/ui/src/lib/apiClient.ts`, `apps/ui/src/lib/api.ts`, `apps/ui/src/components/dashboard/types.ts`
- **Descripción**: helpers de almacén, `rememberedEmail`/`rememberMe` persistidos aparte de los tokens, y el flag en `login` y `verifyTwoFactor` (sólo para decidir el almacén: el TTL lo decide el servidor).

## 6. Pantalla de login *(hecho)*

### 6.1 RED — tests de la pantalla
- **Archivos**: `apps/ui/tests/unit/routes/login.test.tsx`, `apps/ui/tests/unit/lib/auth-context.test.tsx`
- **Descripción**: la casilla se pinta marcada por defecto; refleja la elección anterior; el email vuelve prerrellenado; el envío propaga `rememberMe`; el paso del segundo factor no pinta casilla y hereda la elección.

### 6.2 GREEN — implementar
- **Archivos**: `apps/ui/src/components/ui/checkbox.tsx` (nuevo), `apps/ui/src/routes/login.tsx`, `apps/ui/src/lib/auth-context.tsx`
- **Descripción**: casilla nativa estilada (sin dependencia nueva), `defaultValues` del formulario desde lo recordado, y `login`/`verifyTwoFactor` del contexto aceptando la elección.

### 6.3 REFACTOR
- **Descripción**: revisar que `LoginForm` no supera el límite de líneas ni duplica lógica de almacenamiento con `apiClient`.

## 7. Cierre *(hecho)*

- [x] 7.1 `pnpm verify` en verde (lint + format + tests con coverage de ambas apps + build + typecheck)
- [x] 7.2 Revisar el diff en busca de contraseñas persistidas: no debe haber ninguna
- [x] 7.3 Actualizar `docs/estado-actual.md` (regla 8) y `.env.example`
- [x] 7.4 Commit y push a la rama de trabajo
