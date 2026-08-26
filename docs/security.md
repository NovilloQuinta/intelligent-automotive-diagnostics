# Security Model — Intelligent Automotive Diagnostics

## Scope

API REST (Express 5) + SPA (React 19 / TanStack Start). Autenticación JWT + bcrypt. SQLite via Drizzle ORM. Despliegue single-container Docker.

## Threat Model (OWASP Top 10 2021)

| Threat | Mitigation |
|--------|-----------|
| **A01 Broken Access Control** | JWT Bearer auth middleware, refresh token rotation, account lockout (5 fails → 15 min), `userType` stored for future RBAC |
| **A02 Cryptographic Failures** | bcrypt 12 rounds, JWT with `jti` UUID, separate secrets for access/refresh, production secret assertion at boot |
| **A03 Injection** | Drizzle ORM (parameterized queries), Zod validation on all inputs, JSON body limit 10 KB |
| **A04 Insecure Design** | Clean Architecture, Zod DTOs in application layer, rate limiting on auth endpoints |
| **A05 Security Misconfiguration** | Helmet 8 (CSP `default-src 'none'`, HSTS 1yr, `X-Frame-Options: DENY`), CORS allowlist, `trust proxy` |
| **A06 Vulnerable Components** | `pnpm audit` in CI, up-to-date dependencies |
| **A07 Auth Failures** | bcrypt + JWT, password complexity (uppercase+number+special), account lockout, 5 req/min login rate limit |
| **A08 Data Integrity** | Zod validation on all DTOs, `pnpm-lock.yaml` for reproducible installs |
| **A09 Logging & Monitoring** | Pino structured logs + SQLite persistence, audit log with IP/UA/duration/userId, security event logging (login success/fail, refresh, register, logout, lockout) |
| **A10 SSRF** | LLM URLs from env config only, 30s HTTP timeout on external calls |

## API-Specific (OWASP API Top 10 2023)

Las diez categorías, con la mitigación real y el fichero donde vive. Donde no hay mitigación se dice.

| Threat | Mitigation |
|--------|-----------|
| **API1 Broken Object Level Auth** | JWT `sub` → `userId`, y las consultas por recurso filtran por propietario: `getDiagnosisSession(id, userId)` devuelve 404 —no 403— si la sesión es de otro usuario, para no filtrar su existencia. El listado de historial va siempre acotado por `userId` |
| **API2 Broken Authentication** | bcrypt 12 rondas, JWT con `jti` UUID y secretos separados para access/refresh; rotación de refresh tokens con `revoked_at`; bloqueo de cuenta (5 fallos → 15 min, respuesta 423 con `Retry-After`) que no se prolonga al insistir; tokens de reseteo hasheados SHA-256, de un solo uso y con TTL; `assertProductionSecrets` aborta el arranque si los secretos siguen con valor plantilla |
| **API3 Broken Object Property Level Auth** | Los schemas Zod actúan como allowlist de propiedades en la capa de aplicación: lo que no está declarado no entra. Las respuestas se proyectan campo a campo en el controller, así que un campo nuevo en BD no se filtra solo |
| **API4 Unrestricted Resource Consumption** | Rate limits por familia: login 5/min, refresh 10/min, auth 20/15min, diagnóstico 20/min, cognitivo 5/min, admin 30/min, global 100/15min. Límite de body 10 KB por defecto y 1 MB en el endpoint cognitivo. Presupuesto de búsqueda web: `MAX_WEB_SEARCHES_PER_SESSION = 3`. Timeout de 30 s en llamadas externas. Los contadores se guardan en SQLite, con un namespace por limitador, de modo que reiniciar el proceso no devuelve la cuota y agotar una familia no agota las demás. `RATE_LIMIT_ENABLED` decide si se aplican; sin declarar, solo en producción |
| **API5 Broken Function Level Auth** | Todo `/api/*` detrás del middleware de autenticación; las rutas de administración van además detrás de `requireAdmin` (`admin.middleware.ts`), montado antes que el router de admin, de modo que un usuario con rol `user` no alcanza ningún handler |
| **API6 Unrestricted Access to Sensitive Business Flows** | Los flujos caros son los que llaman al LLM y a la red: el diagnóstico cognitivo lleva el límite más estricto (5/min) y la búsqueda web un presupuesto por sesión. El borrado de DTC (`Service 04`), único flujo destructivo, tiene su propio limiter y se desactiva por completo con `OBD_READ_ONLY=true` |
| **API7 Server Side Request Forgery** | El usuario no controla ninguna URL de salida: las del LLM salen de configuración por entorno y la búsqueda web va contra un proveedor fijo (SerpAPI, `SERPAPI_BASE_URL` constante en `serpApiClient.ts`) con la consulta como parámetro, nunca como destino. Timeout de 30 s |
| **API8 Security Misconfiguration** | Helmet 8 (CSP `default-src 'none'` en la API, HSTS 1 año, `X-Frame-Options: DENY`), allowlist de CORS, `trust proxy = 1` para que el rate limit lea la IP real detrás de Caddy. Swagger UI solo se monta fuera de producción |
| **API9 Improper Inventory Management** | Spec OpenAPI versionada y servida por la propia API, que es la fuente única del inventario de endpoints. **Riesgo residual**: `/api-docs.json` se sirve sin autenticación también en producción, mientras que la UI de Swagger sí queda restringida a entornos no productivos — el inventario es por tanto público. Asumido: la API no es un producto cerrado y no hay endpoints ocultos cuya existencia sea el secreto |
| **API10 Unsafe Consumption of APIs** | Lo que devuelven la búsqueda web y el catálogo de casos previos llega al LLM envuelto en `<untrusted-web-result>` / `<untrusted-catalog-result>`, y el system prompt le instruye a tratarlo como material de referencia y nunca como instrucciones. Los catálogos los alimentan otros usuarios, así que se tratan como pista y no como orden. La respuesta del LLM se parsea y valida antes de persistirse |

### Superficie específica del agente LLM

El proyecto expone un LLM con 16 tools MCP contra un vehículo, lo que añade dos riesgos que el Top 10
genérico no cubre:

- **Actuación no deseada sobre el vehículo.** `fetchPidBytes` valida el modo OBD contra la allowlist
  `READ_ONLY_OBD_MODES` (`domain/obdServiceMode.ts`) **antes** de tocar el socket, y rechaza los
  servicios de control (`2F`, `31`, `11`, `2E`) con `UnsafeObdModeError`. El riesgo real no es una
  alucinación exótica sino transponer `mode` y `pid`: `2F` es nivel de combustible como PID y control
  de actuadores como modo. Una invariante por reflexión (`elm327AdapterInvariant.test.ts`) recorre el
  prototipo del adaptador y falla si un método nuevo emite un servicio de control.
- **Inyección de prompt por datos recuperados.** Ver API10. Además, el system prompt declara
  explícitamente que las instrucciones legítimas solo llegan por el mensaje de sistema, y que ni el
  texto recuperado ni la consulta del usuario pueden cambiarlas.

La batería `pnpm eval:agent` (30 casos, grupos B/C/D/E: ámbito, inyección, extracción e internos)
existe para medir esto último; los casos de seguridad se exigen 3/3.

## Frontend-Specific

- React 19 auto-escapes XSS vectors
- Tokens in `localStorage` (conscious decision: Bearer header + CORS no-credentials = CSRF-resistant; trade-off: XSS-exposable)
- `react-hook-form` + `zodResolver` for client-side validation
- CSP: `default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:`

## Residual Risks

1. **Tokens in localStorage** — XSS → token theft. Mitigation: React's automatic escaping, no `dangerouslySetInnerHTML` on user data.
2. **No MFA** — out of TFM scope; documented for future work.
3. **SQLite at-rest encryption** — not implemented; acceptable for TFM scope.
4. **Rate limit counters tied to one SQLite file** — el contador ya **no** se pierde al
   reiniciar: vive en `rate_limit_counters` (SQLite via Drizzle), con un namespace por
   limitador. Lo que queda: dos replicas sobre **volumenes distintos** siguen contando
   cada una por su lado, asi que el limite efectivo se multiplica por el numero de
   ficheros, no de instancias. Varias replicas sobre el mismo volumen si comparten
   contador. Se cierra del todo con la migracion a PostgreSQL.
5. **No HSTS in practice** — effective only under HTTPS; docker-compose exposes plain HTTP.

## Security Contacts

See `/.well-known/security.txt`
