# Security Model — Intelligent Automotive Diagnostics

## Scope

API REST (Express 5) + SPA (React 19 / TanStack Start). Autenticación JWT + bcrypt. SQLite via Drizzle ORM. Despliegue single-container Docker.

## Threat Model (OWASP Top 10 2021)

| Threat | Mitigation |
|--------|-----------|
| **A01 Broken Access Control** | JWT Bearer auth middleware, refresh token rotation, account lockout (5 fails → 15 min), `userType` stored for future RBAC |
| **A02 Cryptographic Failures** | bcrypt 12 rounds, JWT with `jti` UUID, separate secrets for access/refresh, production secret assertion at boot. El secreto TOTP se guarda cifrado con AES-256-GCM (IV aleatorio por cifrado y tag de autenticacion), con la clave fuera de la base. Los retos de segundo factor y los codigos de recuperacion se guardan hasheados con SHA-256, no en claro |
| **A03 Injection** | Drizzle ORM (parameterized queries), Zod validation on all inputs, JSON body limit 10 KB |
| **A04 Insecure Design** | Clean Architecture, Zod DTOs in application layer, rate limiting on auth endpoints |
| **A05 Security Misconfiguration** | Helmet 8 (CSP `default-src 'none'`, HSTS 1yr, `X-Frame-Options: DENY`), CORS allowlist, `trust proxy` |
| **A06 Vulnerable Components** | `pnpm audit` in CI, up-to-date dependencies |
| **A07 Auth Failures** | bcrypt + JWT, password complexity (uppercase+number+special), account lockout, 5 req/min login rate limit, **segundo factor TOTP** con codigos de recuperacion de un solo uso y obligatorio para administradores. Un codigo incorrecto cuenta para el mismo bloqueo que una contrasena incorrecta |
| **A08 Data Integrity** | Zod validation on all DTOs, `pnpm-lock.yaml` for reproducible installs |
| **A09 Logging & Monitoring** | Pino structured logs + SQLite persistence, audit log with IP/UA/duration/userId, security event logging (login success/fail, refresh, register, logout, lockout) |
| **A10 SSRF** | LLM URLs from env config only, 30s HTTP timeout on external calls |

## API-Specific (OWASP API Top 10 2023)

Las diez categorías, con la mitigación real y el fichero donde vive. Donde no hay mitigación se dice.

| Threat | Mitigation |
|--------|-----------|
| **API1 Broken Object Level Auth** | JWT `sub` → `userId`, y las consultas por recurso filtran por propietario: `getDiagnosisSession(id, userId)` devuelve 404 —no 403— si la sesión es de otro usuario, para no filtrar su existencia. El listado de historial va siempre acotado por `userId` |
| **API2 Broken Authentication** | bcrypt 12 rondas, JWT con `jti` UUID y secretos separados para access/refresh; rotación de refresh tokens con `revoked_at`; bloqueo de cuenta (5 fallos → 15 min, respuesta 423 con `Retry-After`) que no se prolonga al insistir; tokens de reseteo hasheados SHA-256, de un solo uso y con TTL; `assertProductionSecrets` aborta el arranque si los secretos siguen con valor plantilla. **Segundo factor TOTP**: el login con 2FA activa devuelve un reto opaco de un solo uso y 5 min de vida —hasheado en base, revocable— en lugar de tokens, y solo `POST /api/auth/2fa/verify` los emite. Obligatorio para administradores |
| **API3 Broken Object Property Level Auth** | Los schemas Zod actúan como allowlist de propiedades en la capa de aplicación: lo que no está declarado no entra. Las respuestas se proyectan campo a campo en el controller, así que un campo nuevo en BD no se filtra solo |
| **API4 Unrestricted Resource Consumption** | Rate limits por familia: login 5/min, refresh 10/min, auth 20/15min, diagnóstico 20/min, cognitivo 5/min, admin 30/min, global 100/15min. Límite de body 10 KB por defecto y 1 MB en el endpoint cognitivo. Presupuesto de búsqueda web: `MAX_WEB_SEARCHES_PER_SESSION = 3`. Timeout de 30 s en llamadas externas. Los contadores se guardan en SQLite, con un namespace por limitador, de modo que reiniciar el proceso no devuelve la cuota y agotar una familia no agota las demás. `RATE_LIMIT_ENABLED` decide si se aplican; sin declarar, solo en producción. `POST /api/auth/2fa/verify` lleva el suyo (5/min): seis dígitos son 10⁶ combinaciones |
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
- CSP servida por el nginx del contenedor de UI (`apps/ui/nginx/security-headers.conf`), que es
  quien sirve el `dist/`:
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`.
  `script-src` va sin `'unsafe-inline'`: el build de Vite no emite scripts en linea. El
  `'unsafe-inline'` de `style-src` lo exigen los componentes de Radix, que posicionan popovers
  con `style=""`. Las dos fuentes de Google las pide `src/routes/__root.tsx`.
  Verificada en CI por el job `nginx headers`, que arranca la imagen y comprueba las cabeceras
  en `/` y en `/assets/` — nginx corta la herencia de `add_header` en los `location` que
  declaran el suyo, y esa es la forma silenciosa de perderla.
  Hasta el 2026-08-26 esta linea describia una CSP que **no se servia en ningun sitio**: vivia en
  `apps/ui/src/server.ts`, un entry de TanStack Start que el Dockerfile ni copiaba (el build es
  SPA estatica). Ademas le faltaba `https://fonts.googleapis.com`, asi que de haberse desplegado
  habria bloqueado la tipografia. El fichero muerto se ha borrado.

## Residual Risks

> Cada entrada dice **que pasa si se explota** y **que lo cerraria**. Lo que este decidido
> lleva quien y cuando; lo que no, queda marcado como abierto. Revisados uno a uno el
> 2026-08-26: dos de las etiquetas que habia ("out of TFM scope", "acceptable for TFM
> scope") no las habia decidido nadie, y una entrada describia un riesgo que ya no existe.

1. **Tokens en localStorage** — un XSS puede leer el token de acceso y el de refresco y
   suplantar al usuario hasta que caduquen. Mitigacion actual: React escapa por defecto y no
   se usa `dangerouslySetInnerHTML` sobre datos de usuario. **Pendiente, con trabajo
   asignado**: pasar el refresco a cookie `httpOnly` + `Secure` + `SameSite` y anadir
   proteccion CSRF explicita.

2. **Ausencia de segundo factor** — **CERRADO** el 2026-08-26 con TOTP (RFC 6238): alta por
   QR en el perfil, verificacion en el login como segundo paso, diez codigos de recuperacion
   de un solo uso guardados hasheados, y desactivacion que exige contrasena **y** codigo.
   Opcional para el usuario corriente y **obligatorio para administradores**: sin el, el panel
   responde 403. Lo que queda del riesgo es que la 2FA es opcional para el resto, asi que una
   cuenta que no la active sigue dependiendo de un solo factor — decision del producto, no un
   descuido.

3. **La base SQLite no esta cifrada en reposo** — quien obtenga el fichero `.db` lee el
   historico de diagnosticos, los emails y los datos de perfil. Los hashes de contrasena son
   bcrypt, asi que no sirven para entrar. El **secreto TOTP** si seria una llave —quien lo lea
   genera codigos validos indefinidamente—, y por eso va cifrado a nivel de columna con
   AES-256-GCM y clave en `TOTP_ENCRYPTION_KEY`, que no vive en la base: un volcado del `.db`
   ya no basta para anular el segundo factor. Eso **no** es cifrado en reposo, y no cubre a
   quien ejecute codigo en el servidor, porque el proceso necesita la clave para funcionar.
   **DECISION ABIERTA**, no asumida. Dos caminos reales, ninguno atado a un cambio de motor:
   cifrado de disco en el VPS (fuera del codigo; protege ante robo del disco, no ante acceso
   al contenedor) o SQLCipher (cifra el fichero entero, transparente para Drizzle, toca
   `getDb`, el `Dockerfile` y el despliegue). Pendiente medir el coste de SQLCipher en este
   repositorio y decidir con cifras.

4. **El contador de rate limiting es por fichero SQLite** — el contador ya **no** se pierde
   al reiniciar: vive en `rate_limit_counters` (SQLite via Drizzle), con un namespace por
   limitador. Lo que queda: varias replicas sobre **volumenes distintos** cuentan cada una
   por su lado, asi que el limite efectivo se multiplica por el numero de ficheros. Varias
   replicas sobre el mismo volumen si comparten contador, y hoy el despliegue es de una sola
   instancia. Lo cerraria un almacen compartido (otra base o Redis) el dia que se escale
   — **no** un cambio de motor de base de datos: PostgreSQL esta descartado conscientemente
   (ver ADR-002, "Revision de Fase 4: por que no hay PostgreSQL").

5. **Cerrado el 2026-08-26** — los puertos de los contenedores ya no se publican en todas las
   interfaces. `docker-compose.prod.yml` publicaba `4000` (API) y `35000`-`35002` (emuladores
   ELM327) sin IP delante, que en Docker significa `0.0.0.0`: alcanzables por IP del VPS
   saltandose Caddy, y por tanto sin su TLS ni sus cabeceras. Docker publica esos puertos con
   reglas DNAT que se recorren **antes** que INPUT, asi que un `ufw deny` no los habria tapado.
   Lo grave no eran los emuladores —no guardan datos— sino la API: con `trust proxy = 1`
   (`server.ts:292`), correcto detras de Caddy, una peticion directa al `4000` trae un
   `X-Forwarded-For` puesto por el atacante, y `req.ip` pasa a ser lo que el diga. Eso salta el
   rate limit por IP (rotando la cabecera, fuerza bruta sin limite contra `/api/auth/login`) y
   permite escribir IPs falsas en el log de auditoria. El bloqueo de cuenta, que es por usuario,
   si seguia mordiendo.
   Ahora la API y la UI se publican en `127.0.0.1`, que es donde Caddy las busca (corre en
   systemd en el mismo host), y los emuladores **no se publican en absoluto**: la API los alcanza
   por el DNS interno de compose (`ELM327_AUDI_HOST=elm327-audi`), que nunca necesito el
   `ports:`. Desde fuera del VPS solo queda el 443.
   **Pendiente de verificar contra el VPS**: comprobar tras el despliegue que `nc -vz IP 35000` y
   `curl -sI http://IP:4000/health` ya no responden, y que la web sigue sirviendose.
   (Esta entrada decia antes "No HSTS in practice — docker-compose exposes plain HTTP", que
   ya no es cierto: el `Caddyfile` sirve `diag.jcodinglabs.com` con TLS de Let's Encrypt y
   emite `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.)

## Security Contacts

See `/.well-known/security.txt`
