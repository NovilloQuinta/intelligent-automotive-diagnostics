## Why

`createRateLimiter` usa el `MemoryStore` por defecto de `express-rate-limit`. El contador de
peticiones vive en el heap del proceso, y de ahi salen dos agujeros:

1. **Se pierde al reiniciar.** Cada despliegue, cada `docker compose restart` y cada crash
   devuelven a todo el mundo su cuota entera. El limite de `/api/auth/login` es 5/min: quien
   quiera hacer fuerza bruta solo tiene que esperar a un reinicio para volver a tener cinco
   intentos. El propio `docs/security.md` lo lleva escrito como riesgo residual 4.
2. **No se comparte entre instancias.** Con N replicas cada contenedor cuenta por su lado, asi
   que el limite efectivo es N x el configurado. Hoy `diag.jcodinglabs.com` corre una sola
   instancia, pero el numero que dice la documentacion deja de ser cierto en cuanto se escale.

Hay ademas un tercer problema, mas silencioso: el middleware se **desactiva solo** cuando
`NODE_ENV !== 'production'` devolviendo un `next()` vacio. Eso no es una decision escrita en
ningun sitio, es el efecto lateral de una comparacion de cadenas, y significa que en
desarrollo y en test los limitadores no existen y nadie los ejercita nunca.

## What Changes

- **Tabla `rate_limit_counters`** en `schema.ts` con clave primaria compuesta
  `(namespace, client_key)` y su migracion generada por `drizzle-kit`.
- **`SqliteRateLimitStore`**, que implementa el interfaz `Store` de `express-rate-limit`
  (`increment`, `decrement`, `resetKey`, mas `init` y `resetAll`) sobre Drizzle. Purga las
  ventanas caducadas para que la tabla no crezca sin limite.
- **Namespace por limitador.** `RateLimiterConfig` gana `namespace`. Sin el, los diez
  limitadores de `server.ts` compartirian fila para la misma IP y se agotarian entre si.
  La firma de `createRateLimiter` no cambia: sigue siendo `(config?: Partial<RateLimiterConfig>)`.
- **`RATE_LIMIT_ENABLED`.** El apagado fuera de produccion pasa a ser una decision explicita
  y configurable, con el mismo valor por defecto que hoy (`NODE_ENV === 'production'`).

## Capabilities

### Modified Capabilities
- `rate-limiting`: el contador deja de vivir en memoria y pasa a SQLite, con un espacio de
  claves por limitador y activacion explicita por configuracion.

## Dependencies

Ninguna. Se apoya en `develop` tal cual esta: la conexion SQLite (`getDb`), Drizzle y
`express-rate-limit` v8 ya estan en el proyecto. No entra ninguna dependencia nueva.

## Impact

- **Nuevo**: `apps/core-api/src/infrastructure/persistence/sqlite/rateLimitStore.ts`
- **Nuevo**: `apps/core-api/drizzle/0007_*.sql` + snapshot (generados, no escritos a mano)
- **Modificado**: `schema.ts` (tabla nueva)
- **Modificado**: `rate-limiter.middleware.ts` (store, namespace, `RATE_LIMIT_ENABLED`)
- **Modificado**: `server.ts` (los 10 puntos pasan a nombrar su namespace)
- **Modificado**: `configuration/index.ts` y `.env.example` (`RATE_LIMIT_ENABLED`)
- **Modificado**: `tests/unit/infrastructure/http/rateLimits.test.ts` — sus casos hoy dan por
  hecho que el contador nace a cero en cada `bootApp()`; con un store persistente hay que
  aislarlos explicitamente
- **Fuera de alcance**: cifrado de la BD en reposo (va con la migracion a PostgreSQL)
