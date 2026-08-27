## Contexto

`rate-limiter.middleware.ts` entero son 28 lineas:

```ts
export function createRateLimiter(config?: Partial<RateLimiterConfig>) {
  const windowMinutes = config?.windowMinutes ?? DEFAULT_WINDOW_MINUTES
  const maxRequests = config?.maxRequests ?? DEFAULT_MAX_REQUESTS

  if (process.env.NODE_ENV !== 'production') {
    return (_req: unknown, _res: unknown, next: () => void) => next()
  }

  return rateLimit({ windowMs: windowMinutes * 60 * 1000, limit: maxRequests, ... })
}
```

No se pasa `store`, asi que `express-rate-limit` instancia su `MemoryStore`: un `Map` en el
heap con un `setInterval` de limpieza. Se llama diez veces desde `server.ts`, con ventanas y
limites distintos:

| Punto de montaje | Ventana | Limite |
|---|---|---|
| global (`app.use`) | 15 min | 100 |
| `/api/auth` (familia) | 15 min | 20 |
| `/api/auth/login` | 1 min | 5 |
| `/api/auth/refresh` | 1 min | 10 |
| `/api/auth/forgot-password` | 15 min | 5 |
| `/api/diagnosis` y hermanos | 1 min | 20 |
| `/api/mcp/cognitive-diagnosis` | 1 min | 5 |
| `/api/clear-dtc` | 1 min | 5 |
| `/api/admin` | 1 min | 30 |
| `/api/profile/change-password` | 15 min | 5 |

Cada `rateLimit()` recibe hoy su propio `MemoryStore`, asi que el aislamiento entre
limitadores es gratis: son diez `Map` distintos. Al pasar a una tabla compartida ese
aislamiento hay que reconstruirlo a mano, y es la decision central de este design.

La clave que genera `express-rate-limit` por defecto es la IP del cliente
(`req.ip`, correcta gracias al `trust proxy = 1` que ya pone `server.ts`).

## Goals / Non-Goals

**Goals:**
- El contador sobrevive al reinicio del proceso.
- Los diez limitadores siguen siendo independientes entre si.
- `createRateLimiter` no cambia de firma: quien la llama no se entera.
- La tabla no crece sin limite.
- El apagado fuera de produccion queda escrito como decision, no como efecto lateral.

**Non-Goals:**
- No se comparte el contador entre varias maquinas con ficheros SQLite distintos. Eso lo
  cierra la migracion a PostgreSQL, no este cambio (ver "Riesgo residual").
- No se cambian las ventanas ni los limites de ninguna ruta.
- No se cifra la base en reposo (fuera de alcance explicito del encargo).
- No se toca la clave por cliente: sigue siendo la IP que resuelve `express-rate-limit`.

## Decisiones

### Decision 1: namespace por limitador, no una clave compuesta improvisada

**El problema**: con una sola tabla y la IP como clave, agotar `/api/auth/login` (5/min)
agotaria tambien `/api/admin` (30/min) para esa misma IP, porque comparten fila. Existe un
test en `rateLimits.test.ts` que blinda justo lo contrario ("should not let /api/admin
exhaustion affect /api/diagnosis, nor vice versa"), asi que el fallo saldria a la primera.

**Elegido**: `RateLimiterConfig` gana `namespace`, y la clave primaria de la tabla es
`(namespace, client_key)`:

```ts
export interface RateLimiterConfig {
  readonly windowMinutes: number
  readonly maxRequests: number
  readonly namespace: string
}
```

La firma publica **no cambia** — sigue siendo `createRateLimiter(config?: Partial<RateLimiterConfig>)` —
asi que ningun llamante se rompe al compilar. Lo que cambia es que los diez puntos de
`server.ts` pasan a nombrar el suyo: `global`, `auth`, `auth:login`, `auth:refresh`,
`auth:forgot-password`, `diagnosis`, `diagnosis:cognitive`, `diagnosis:clear-dtc`, `admin`,
`profile:change-password`.

**Descartado — namespace autogenerado** (un contador incremental o un UUID por llamada): es
lo unico que no puede funcionar aqui. Un namespace que cambia en cada arranque hace que el
contador guardado sea inalcanzable tras el reinicio, que es exactamente el fallo que este
cambio viene a cerrar.

**Descartado — derivar el namespace de la ruta montada**: `app.use(path, limiter)` no le
comunica el path al middleware, y `req.baseUrl` varia entre peticiones al mismo limitador.

**Fallback cuando no se pasa namespace**: `` `default:${windowMinutes}m:${maxRequests}` ``.
Es determinista y estable entre reinicios, que es el requisito duro. Su limitacion hay que
decirla en voz alta: **dos limitadores con la misma ventana y el mismo limite que no declaren
namespace comparten contador**. En la tabla de arriba eso pasaria tres veces (1 min/5 lo usan
login, cognitivo y clear-dtc). Por eso los diez puntos declaran el suyo explicitamente y el
fallback queda solo como red de seguridad para un llamante futuro despistado.

### Decision 2: el store resuelve la BD por su cuenta, perezosamente

**El problema**: `createRateLimiter` no recibe dependencias, y no puede recibirlas sin cambiar
el contrato. Pero el store necesita una conexion.

**Elegido**: el store llama a `getDb()` en su primera operacion, no en el constructor.

`getDb()` es un singleton, y el orden de arranque ya garantiza que este abierto sobre el
fichero real: `buildApp` llama a `createPersistenceRepositories(config)` —que hace
`getDb(config.DB_PATH)`— **antes** de `createServer(...)`. Resolver perezosamente en vez de en
el constructor evita ademas que construir un middleware abra una BD en memoria por sorpresa.

El constructor acepta un `db` opcional para que los tests inyecten el suyo. Es el mismo patron
que `SqliteRefreshTokenStore` y compania, salvo por el `?`.

**Coste asumido**: `rate-limiter.middleware.ts` (capa http) pasa a importar de
`persistence/sqlite/`. Las dos son infrastructure, asi que no se cruza ninguna frontera de
Clean Architecture, pero si es una dependencia lateral que antes no estaba. La alternativa
—cablear el store desde `composition.ts`— exige que `createRateLimiter` reciba la BD, y el
encargo pide explicitamente que su contrato no cambie.

### Decision 3: `RATE_LIMIT_ENABLED`, con el default de hoy

El apagado fuera de produccion **se queda**, pero deja de ser un efecto lateral:

```ts
function rateLimitEnabled(): boolean {
  const raw = process.env.RATE_LIMIT_ENABLED
  if (raw === undefined || raw === '') return process.env.NODE_ENV === 'production'
  return raw === 'true'
}
```

**Por que se queda apagado por defecto**: la suite tiene ~1500 tests que hacen decenas de
peticiones al mismo endpoint desde `127.0.0.1`. Con los limitadores activos, la mitad
empezaria a comerse 429 por razones que no tienen nada que ver con lo que cada test prueba.
Y en desarrollo, recargar la SPA agotaria la cuota en minutos.

**Que gana siendo explicito**: que se puede encender (`RATE_LIMIT_ENABLED=true`) sin mentirle
a `NODE_ENV`. Hoy, para probar un limitador de verdad, hay que declararse en produccion —que
es justo lo que hace `rateLimits.test.ts`, poniendo `process.env.NODE_ENV = 'production'` en
un `beforeEach`, con todo lo que eso arrastra (`assertProductionSecrets`, Swagger apagado).

**Descartado — activarlos siempre**: mas fiel a produccion, pero convierte una tarea de
seguridad en un repaso de toda la suite, y el ruido en desarrollo no compra nada.

### Decision 4: transaccion sincrona, y purga en cada `increment`

`better-sqlite3` es sincrono, y el interfaz `Store` de `express-rate-limit` admite metodos
sincronos (`increment: (key) => Promise<IncrementResponse> | IncrementResponse`). Se aprovecha:
`db.transaction(...)` de Drizzle hace el leer-decidir-escribir atomico sin `async`, que es lo
que hace falta para que dos peticiones concurrentes no lean el mismo contador.

La purga de ventanas caducadas va **dentro de la misma transaccion del `increment`**, como un
`DELETE ... WHERE reset_at <= now` que el indice sobre `reset_at` resuelve. Alternativa
descartada: un `setInterval` de limpieza, que es lo que hace `MemoryStore` — pero un timer en
un proceso que puede morir en cualquier momento reintroduce en pequeño el problema que este
cambio viene a resolver, y ademas hay que acordarse de pararlo (`shutdown`).

## Riesgo residual

Este cambio cierra el reinicio. **No cierra del todo el multi-instancia**: dos replicas que
monten volumenes distintos siguen teniendo cada una su fichero SQLite y su contador. Lo que si
resuelve es el caso realista de este proyecto —varias replicas sobre el mismo volumen— y deja
el codigo preparado, porque el store habla Drizzle y no SQL crudo. El cierre completo va con la
migracion a PostgreSQL, junto con el cifrado en reposo. Hay que reescribirlo asi en
`docs/security.md`, no borrarlo.

## Plan de migracion

La tabla nace vacia y se llena sola. No hay datos que migrar, y una BD sin la tabla
simplemente empieza a contar desde cero la primera vez que se aplica la migracion. La
migracion se genera con `pnpm db:generate` (drizzle-kit), nunca a mano.
