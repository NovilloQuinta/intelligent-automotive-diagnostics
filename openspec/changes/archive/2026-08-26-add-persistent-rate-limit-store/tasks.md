## 0. Preparacion

- [x] 0.1 Verificar baseline en verde antes de tocar nada (`pnpm test`)
- [x] 0.2 Rama de trabajo plantada sobre `origin/develop`, comprobada con `git branch --show-current`
- [x] 0.3 Cargar contexto: `rate-limiter.middleware.ts`, `server.ts`, `schema.ts`, `db.ts`, `refreshTokenStore.ts`, `rateLimits.test.ts`

## 1. Tabla `rate_limit_counters` + migracion

### 1.1 RED ✅ — test de que la tabla existe y acepta el par (namespace, clientKey)
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/persistence/sqlite/rateLimitStore.test.ts` (nuevo)
- **Descripcion**: primer test del store contra una BD en memoria. Falla porque no existe ni la tabla ni el store.

### 1.2 GREEN ✅ — tabla en `schema.ts` + migracion generada
- **Archivos**: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts`, `apps/core-api/drizzle/0007_*.sql`
- **Descripcion**: `rateLimitCounters` con PK compuesta `(namespace, clientKey)`, `hits`, `resetAt` (epoch ms) e indice sobre `resetAt`. Migracion con `pnpm db:generate`, **nunca escrita a mano**.
- **Criterio de aceptacion**: la migracion aparece en `drizzle/meta/_journal.json` y `getDb()` la aplica sin error.

## 2. `SqliteRateLimitStore`

### 2.1 RED ✅ — contrato completo del store
- **Archivos**: `tests/unit/infrastructure/persistence/sqlite/rateLimitStore.test.ts`
- **Descripcion**: `increment` cuenta desde 1 y devuelve `resetTime`; `increment` repetido acumula dentro de la ventana; ventana caducada reinicia a 1; `decrement` resta con suelo en 0; `resetKey` borra solo esa clave; `resetAll` limpia el namespace; la purga elimina filas caducadas de otros clientes; dos namespaces no se pisan.

### 2.2 GREEN ✅ — implementar el store
- **Archivos**: `apps/core-api/src/infrastructure/persistence/sqlite/rateLimitStore.ts` (nuevo)
- **Dependencias**: 1.2, 2.1
- **Descripcion**: clase que implementa `Store` de `express-rate-limit`. `init(options)` captura `windowMs`. `increment` en una transaccion sincrona de Drizzle: purga caducadas, lee, decide reinicio o acumulacion, escribe. `db` opcional en el constructor con `getDb()` perezoso por defecto (design D2).
- **Criterio de aceptacion**: todos los tests de 2.1 en verde.

### 2.3 REFACTOR ✅
- **Descripcion**: revisar que ninguna funcion pase de 40 lineas ni de complejidad 5 (`pnpm lint` los marca como warning). Comprobar TSDoc en los exports publicos.

## 3. `createRateLimiter` — namespace, store y `RATE_LIMIT_ENABLED`

### 3.1 RED ✅ — tests del middleware
- **Archivos**: `tests/unit/infrastructure/http/middleware/rateLimiter.test.ts` (modificar)
- **Descripcion**: se pasa un `store` a `rateLimit`; el namespace por defecto se deriva de ventana+limite; un namespace explicito llega al store; las cuatro combinaciones de `RATE_LIMIT_ENABLED` x `NODE_ENV` del spec.

### 3.2 GREEN ✅ — implementar
- **Archivos**: `rate-limiter.middleware.ts`
- **Descripcion**: `namespace` en `RateLimiterConfig`, `store: new SqliteRateLimitStore({ namespace })`, helper `rateLimitEnabled()`. La firma publica no cambia.

### 3.3 GREEN ✅ — declarar la variable
- **Archivos**: `infrastructure/configuration/index.ts`, `.env.example`
- **Descripcion**: `RATE_LIMIT_ENABLED` en el schema Zod (opcional, sin default, para no duplicar la regla de precedencia que vive en el middleware) y documentada en `.env.example`.

## 4. Namespaces en `server.ts`

### 4.1 RED ✅ — el test de aislamiento cubre el par que hoy no cubre
- **Archivos**: `tests/unit/infrastructure/http/rateLimits.test.ts`
- **Descripcion**: ademas del caso admin/diagnosis que ya existe, uno que agote `/api/mcp/cognitive-diagnosis` (1 min/5) y compruebe que `/api/clear-dtc` (1 min/5, misma ventana y mismo limite) sigue intacto. Es el caso que el fallback de namespace no distinguiria.

### 4.2 GREEN ✅ — nombrar los diez namespaces
- **Archivos**: `apps/core-api/src/infrastructure/http/server.ts`
- **Descripcion**: `global`, `auth`, `auth:login`, `auth:refresh`, `auth:forgot-password`, `diagnosis`, `diagnosis:cognitive`, `diagnosis:clear-dtc`, `admin`, `profile:change-password`.

### 4.3 GREEN ✅ — aislar los casos de `rateLimits.test.ts`
- **Archivos**: `tests/unit/infrastructure/http/rateLimits.test.ts`
- **Descripcion**: sus 9 casos bootean una app nueva cada uno y **hoy dan por hecho que el contador nace a cero**. Con el store persistente comparten tabla dentro del fichero. Anadir un `beforeEach` que la limpie. No es un parche: es la consecuencia real de que el contador ya no muera con el middleware.

## 5. Prueba del reinicio (lo que pide el encargo)

### 5.1 RED ✅/GREEN — test de supervivencia
- **Archivos**: `tests/unit/infrastructure/http/rateLimits.test.ts`
- **Descripcion**: agotar el limite de login contra una app, cerrarla, **bootear una app nueva** sobre la misma BD y comprobar que la siguiente peticion sigue dando 429. Es la prueba de que el contador no vive en el proceso.

## 6. Cierre

- [x] 6.1 `pnpm verify` en verde (lint + format + test + build + typecheck de las dos apps)
- [x] 6.2 `pnpm test:coverage` sin bajar ningun umbral
- [x] 6.3 Comprobacion manual del reinicio con `DB_PATH` persistente
- [x] 6.4 `docs/security.md`: reescribir el riesgo residual 4 con lo que queda (multi-instancia), no borrarlo
- [x] 6.5 `docs/deuda-conocida.md`: **re-medir** tests y avisos, no estimar
- [x] 6.6 `docs/estado-actual.md`: max 15 lineas, solo estado presente
- [x] 6.7 Avisar del bullet de la slide 17 que queda obsoleto (vive fuera de `develop`, no se toca)
