## 0. Preparación

- [x] 0.1 Crear `feat/admin-management-panel` desde `develop` (worktree ya existente, ver nota del supervisor)
- [x] 0.2 Verificar baseline: `pnpm --filter core-api test` en verde; 744 tests passed | 1 skipped (71 archivos)
- [x] 0.3 Cargar contexto: este `proposal.md`/`design.md`/`specs/admin-management-panel/spec.md`, `schema.ts`, `domain/entities/user.ts`, `userMapper.ts`, `safeUser.ts`, `auth.middleware.ts`, `audit-logger.middleware.ts`, `sqlite/userRepository.ts`, `AuditLogRepository.ts` (puerto), `VectorStore.ts` (puerto), `vectorTableConfigs.ts`, `composition.ts`, `server.ts`
- [x] 0.4 Comprobar cómo obtiene el `userId` del token el resto de rutas protegidas (`req.userId`) y reutilizar ese mismo mecanismo en `requireAdmin`, no inventar otro

## Bloque A — Rol de administrador (agente: writer)

### A1. Esquema y migración

- [x] A1.1 Añadir columna `role` a `users` (`text`, not null, default `'user'`) en `schema.ts`
- [x] A1.2 Generar la migración Drizzle y revisarla a mano — confirmar que es un `ALTER TABLE ADD COLUMN` con `DEFAULT`, no una reconstrucción de tabla. **Desviación:** no hay carpeta `drizzle/` previa (el repo aplica el esquema con `db:push`), así que `drizzle-kit generate` genera un `0000_*.sql` con `CREATE TABLE` de las 9 tablas completas, no un diff incremental. Verificado por separado que el diff real contra una BD existente es exactamente `ALTER TABLE users ADD role text DEFAULT 'user' NOT NULL;` (sin pérdida de datos). No se ha añadido la carpeta `drizzle/` al repo para no introducir ese ruido; se sigue aplicando vía `db:push` como ya hacía el proyecto.
- [x] A1.3 Verificar que la app arranca contra una base de datos existente sin perder datos ni fallar — probado con `db:push` contra una BD SQLite con un usuario preexistente: la fila se conserva íntegra y `role` queda en `'user'`.

### A2. Entidad y mappers

- [x] A2.1 RED: test — `User` acepta `role: 'user' | 'admin'` y expone `isAdmin`
- [x] A2.2 GREEN: añadir `role` e `isAdmin` a la entidad `User` (domain, sin imports de capas superiores)
- [x] A2.3 RED: test — `toUser` (userMapper) mapea la columna `role` de la fila SQLite a la entidad
- [x] A2.4 GREEN: actualizar `userMapper.ts`
- [x] A2.5 RED: test — `toSafeUser` conserva `role`/`isAdmin` y sigue omitiendo `passwordHash`
- [x] A2.6 GREEN: actualizar `safeUser.ts`
- [x] A2.7 RED: test — `toCreateValues` (o el flujo de `RegisterUserUseCase`) crea usuarios con `role: 'user'` por defecto
- [x] A2.8 GREEN: implementar
- [x] A2.9 REFACTOR: con la suite en verde — revisar que ningún tipo `any` se haya colado al desestructurar `role` (se usa `as 'user' | 'admin'`, mismo patrón que `userType` ya existente)

### A3. Middleware `requireAdmin`

- [x] A3.1 RED: test — sin `req.userId` (no pasó por `authMiddleware`), `requireAdmin` responde 401
- [x] A3.2 RED: test — `req.userId` de un usuario con `role: 'user'`, `requireAdmin` responde 403
- [x] A3.3 RED: test — `req.userId` de un usuario con `role: 'admin'`, `requireAdmin` llama a `next()`
- [x] A3.4 RED: test — `req.userId` que no corresponde a ningún usuario (borrado), `requireAdmin` responde 401, no 403
- [x] A3.5 GREEN: implementar `createRequireAdmin(userRepo)` en `middleware/admin.middleware.ts`, siguiendo el patrón factory de `createAuthMiddleware`
- [x] A3.6 REFACTOR: con la suite en verde — confirmar que el middleware no decodifica el JWT ni lee ningún claim de rol (solo lee `req.userId` y consulta `userRepo.findById`)

### A4. Seed de administrador

- [x] A4.1 RED: test — con `ADMIN_EMAIL`/`ADMIN_PASSWORD` configuradas y sin usuario existente, se crea un usuario `role: 'admin'` con la contraseña hasheada igual que `AuthService`
- [x] A4.2 RED: test — si ya existe un usuario con ese email, no se crea uno nuevo ni se sobrescribe la contraseña
- [x] A4.3 RED: test — sin `ADMIN_EMAIL`/`ADMIN_PASSWORD`, el arranque no lanza excepción y registra un warning
- [x] A4.4 GREEN: implementar el seed en `composition.ts`, reusando el hash de `AuthService` (no una segunda implementación de bcrypt)
- [x] A4.5 REFACTOR: con la suite en verde — verificar que la contraseña nunca aparece en ningún log (test dedicado que serializa todas las llamadas al logger y comprueba que no contienen la contraseña)

### A5. `/api/auth/me` con rol

- [x] A5.1 RED: test — `GET /api/auth/me` de un usuario normal devuelve `role: 'user'`
- [x] A5.2 RED: test — `GET /api/auth/me` de un admin devuelve `role: 'admin'`
- [x] A5.3 GREEN: propagar `role` desde `GetCurrentUserUseCase`/`AuthController` hasta la respuesta (ya fluía sin cambios de código gracias a A2/A2.6; ambos tests pasaron en verde con `toSafeUser` ampliado)
- [x] A5.4 REFACTOR: con la suite en verde — confirmar que sigue usando `safeUser` y no expone `passwordHash`

## Bloque B — Puertos, repositorios y casos de uso (agente: writer, depende de Bloque A)

### B1. DTOs de filtro (Zod)

- [x] B1.1 RED: test — el esquema base (`AdminListFilter`) acota `pageSize` a un máximo de 100 y rechaza valores mayores o los recorta según lo decidido en `design.md` — se optó por rechazar (400), no recortar
- [x] B1.2 RED: test — `AdminLogsFilter` valida `level` contra los niveles conocidos del logger
- [x] B1.3 RED: test — `AdminAuditFilter` valida `statusCode` como entero HTTP válido
- [x] B1.4 RED: test — `from` posterior a `to` es inválido en cualquiera de los esquemas que lo usan
- [x] B1.5 GREEN: implementar los esquemas Zod en `application/dto/admin/`
- [x] B1.6 REFACTOR: con la suite en verde — extraer el esquema base compartido para que los tres no dupliquen paginación/fechas (`AdminListFilter.ts` + helper `refineDateRange`)

### B2. `LogRepository` (puerto + SQLite)

- [x] B2.1 RED: test — `list(filter)` filtra por `level`, `from`/`to`, `q` sobre `message`, ordena por fecha descendente
- [x] B2.2 RED: test — `list(filter)` pagina con `page`/`pageSize` y devuelve el total de coincidencias
- [x] B2.3 GREEN: definir el puerto `LogRepository` en `application/ports/` e implementar `SqliteLogRepository` siguiendo el estilo de `sqlite/userRepository.ts`
- [x] B2.4 REFACTOR: con la suite en verde — comprobar que el filtrado y la paginación viven en la consulta SQL, no en memoria

### B3. `AuditLogRepository` ampliado

- [x] B3.1 RED: test — `list(filter)` filtra por `statusCode`, `path`, `userId`, `from`/`to`, ordena por fecha descendente, pagina y devuelve el total
- [x] B3.2 RED: test — `stats(range)` devuelve un resumen agregado (por status y por ruta) sin filas individuales
- [x] B3.3 GREEN: ampliar el puerto `AuditLogRepository` y `sqlite/auditLogRepository.ts`
- [x] B3.4 REFACTOR: con la suite en verde — revisar que `stats` no reutilice la misma query que `list` sin necesidad. **Bug descubierto y corregido (fuera de A, dentro de B):** `schema.ts` define `createdAt` con `.default("datetime('now')")`, que Drizzle trata como valor literal de columna, no como expresión SQL — cualquier insert que omitiera `createdAt` guardaba literalmente el texto `"datetime('now')"` en vez de una fecha real. Esto rompía en silencio cualquier filtro/orden por fecha. Afectaba a `auditLogMapper.toAuditValues` y a `Logger.saveToDb`, que nunca fijaban `createdAt`. Corregido fijando `createdAt: new Date().toISOString()` explícitamente en ambos (mismo patrón que ya usa `userMapper.toCreateValues`), sin tocar `schema.ts`. Detectado por el propio test de `stats` con rango de fechas.
- [x] B3.5 (añadida) test de regresión que reproduce el bug anterior con `repo.create()` real + `stats({from: futuro})`

### B4. `UserRepository` ampliado

- [x] B4.1 RED: test — `list(filter)` filtra por `q` sobre email/username y rango de fecha de registro, pagina, ordena, devuelve total, y nunca incluye `passwordHash`
- [x] B4.2 RED: test — `stats()` devuelve totales por `userType` y por `role`
- [x] B4.3 GREEN: ampliar el puerto `UserRepository` y `sqlite/userRepository.ts`
- [x] B4.4 REFACTOR: con la suite en verde — confirmar que `list()` usa la misma proyección segura que `safeUser` (pasa cada fila por `toUser` + `toSafeUser`), no una proyección paralela

### B5. `VectorStore` ampliado (`count`, `sample`)

- [x] B5.1 RED: test — `count()` devuelve el número de filas de la tabla configurada
- [x] B5.2 RED: test — `sample(limit)` devuelve como máximo `limit` filas sin invocar generación de embeddings
- [x] B5.3 GREEN: ampliar el puerto `VectorStore` e implementar en `lanceVectorStore.ts` (`count()` → `table.countRows()`; `sample(limit)` → `table.query().limit(limit).toArray()`, sin vector)
- [x] B5.4 **No se pudo medir contra las tablas reales**: este worktree/sandbox no tiene `data/lancedb` poblado (no existe la carpeta). Alternativa aplicada en su lugar: inspección del código fuente de `@lancedb/lancedb@0.31.0` (`dist/table.js`) — `Table.countRows()` delega directamente en el binding nativo (`this.inner.countRows(filter)`), que en el formato Lance lee el recuento de filas por fragmento desde los metadatos del dataset, no un escaneo completo. Es una garantía de diseño del formato, no una medición empírica sobre `pids_index`/`dtcs_index`/`diagnoses_index`. Si al desplegar contra datos reales se observa degradación, cachear el conteo con TTL corto (ya previsto como riesgo en `design.md`).
- [x] B5.5 REFACTOR: con la suite en verde — verificar que `sample` no llama a `embed()` en ningún camino (usa `table.query()`, nunca `table.search()`, que es el único camino con vector)

### B6. Casos de uso de administración

- [x] B6.1 RED: test — `ListSystemLogsUseCase` delega en `LogRepository.list` con el filtro validado
- [x] B6.2 RED: test — `ListAuditLogsUseCase` delega en `AuditLogRepository.list`
- [x] B6.3 RED: test — `ListUsersUseCase` delega en `UserRepository.list` y el resultado nunca contiene `passwordHash` (incluye test defensivo: aunque el repo filtrara `passwordHash`, el caso de uso lo vuelve a quitar)
- [x] B6.4 RED: test — `GetKnowledgeStatsUseCase` combina `count()`/`sample()` de los tres índices en un único resumen
- [x] B6.5 RED: test — `GetAdminOverviewUseCase` agrega totales de usuarios (`UserRepository.stats`), errores recientes (`LogRepository.list` filtrado por `level=error` y ventana de 24h) y actividad HTTP por ruta (`AuditLogRepository.stats`)
- [x] B6.6 GREEN: implementar los cinco casos de uso en `application/use-cases/admin/`, sin ningún import de `infrastructure/`
- [x] B6.7 REFACTOR: con la suite en verde — ninguno de los casos de uso reimplementa paginación/filtrado; solo delegan, agregan o combinan resultados de los puertos

## Bloque C — Controlador y rutas (agente: writer, depende de Bloque B)

### C1. `AdminController`

- [x] C1.1 RED: test — `GET /overview` responde 200 con el resumen del caso de uso
- [x] C1.2 RED: test — `GET /logs` valida query params con el esquema Zod y responde 400 si son inválidos
- [x] C1.3 RED: test — `GET /audit-logs` idem
- [x] C1.4 RED: test — `GET /users` idem, y la respuesta nunca incluye `passwordHash` aunque el repositorio lo tuviera
- [x] C1.5 RED: test — `GET /knowledge` responde con conteo y muestra de los tres índices
- [x] C1.6 RED: test — `POST /knowledge/search` valida el cuerpo (texto de búsqueda, índice objetivo) y delega en el mismo flujo `embed`+`VectorStore.query()` que usa el RAG real (via `KnowledgeStack.search()`, no una llamada directa a `VectorStore.query()` sin embedding)
- [x] C1.7 GREEN: implementar `AdminController` en `infrastructure/http/controllers/`
- [x] C1.8 REFACTOR: con la suite en verde — el controlador solo parsea/valida/delega; cero lógica de negocio (agregación vive en los casos de uso de Bloque B)

### C2. Rutas, middlewares y rate limit

- [x] C2.1 RED: test — cualquier ruta bajo `/api/admin` sin token responde 401
- [x] C2.2 RED: test — cualquier ruta bajo `/api/admin` con token de usuario no admin responde 403
- [x] C2.3 RED: test — exceder el rate limit propio de `/api/admin` responde 429 sin afectar el contador de `/api/diagnosis` ni `/api/auth`
- [x] C2.4 GREEN: implementar `admin.routes.ts` (orden: `authMiddleware` (global, ya montado) → `requireAdmin` → rate limiter → controlador) y montarlo en `server.ts` bajo `/api/admin`, siguiendo el patrón de `applyDiagnosisRateLimits`
- [x] C2.5 Documentar los seis endpoints. **Desviación:** el proyecto tiene `swagger-jsdoc` como dependencia pero no lo usa en ningún sitio — no hay un solo comentario `@swagger` en el código; la spec OpenAPI real es el objeto plano `openApiSpec` en `swagger.ts`, mantenido a mano. Documenté los seis endpoints ahí, siguiendo exactamente ese patrón (paths + schemas en `components.schemas`), en vez de introducir jsdoc que rompería la consistencia con el resto del archivo. `AdminOverview.httpRequestsByPathApprox` documenta explícitamente en su `description` que es una aproximación derivada de `audit_logs`, no diagnósticos reales.
- [x] C2.6 REFACTOR: con la suite en verde — `mountAdminRoutes` no monta nada si falta `adminController` o `requireAdmin` (evita rutas a medio cablear); el orden de middlewares vive en una sola función, sin duplicación

### Hallazgo adicional durante C (fuera del alcance original, corregido en el mismo archivo que pedía la exclusión)

`createAuditLogger` leía `req.path`, que Express reescribe a la ruta relativa al punto de montaje mientras la petición está dentro de un sub-router (p. ej. `/api/admin`) — si la respuesta se envía sin volver a subir por la cadena de middlewares (caso normal), `req.path` en el listener `finish` queda como `/overview`, no `/api/admin/overview`. Esto rompía tanto la exclusión pedida como, en teoría, el campo `path` guardado para **cualquier** ruta montada vía sub-router (`/api/diagnosis`, `/api/freeze-frame`, etc. — no solo las nuevas de admin). Corregido leyendo `req.originalUrl` (que sí sobrevive al montaje) con fallback a `req.url`/`req.path`. Test de regresión añadido en `auditLogger.test.ts` que simula ese escenario con `path` y `originalUrl` distintos.

## Bloque D — UI (agente: writer, depende de Bloque C)

### D1. Cliente API y guardia de ruta

- [ ] D1.1 RED: test — `apps/ui/src/lib/api.ts` expone funciones tipadas para los seis endpoints admin, reusando el manejo de tokens existente
- [ ] D1.2 GREEN: implementar en `api.ts`
- [ ] D1.3 RED: test — `AuthUser`/el estado de auth de la UI expone `role`
- [ ] D1.4 GREEN: propagar `role` desde `/api/auth/me`
- [ ] D1.5 RED: test — la ruta `admin.tsx` (layout) redirige o muestra "acceso denegado" si el usuario no es admin, sin llamar a ningún endpoint admin
- [ ] D1.6 GREEN: implementar la guardia en `admin.tsx`
- [ ] D1.7 REFACTOR: con la suite en verde — confirmar que la guardia usa el mismo estado de auth que el resto de la app, no uno paralelo

### D2. `DataTableFilters` reutilizable

- [ ] D2.1 RED: test — cambiar un filtro (texto, nivel/status, rango de fechas) invoca el callback con los parámetros nuevos, sin filtrar internamente
- [ ] D2.2 RED: test — los atajos "hoy"/"7 días"/"30 días" calculan `from`/`to` y usan los mismos parámetros que el filtro manual
- [ ] D2.3 GREEN: implementar `components/admin/DataTableFilters.tsx` reusando `@/components/ui/*`
- [ ] D2.4 REFACTOR: con la suite en verde — comprobar que no quedó lógica de fechas duplicada entre el componente y sus consumidores

### D3. Tablas de administración

- [ ] D3.1 RED: test — `OverviewCards` pinta los totales devueltos por `/api/admin/overview`, incluida la etiqueta de "peticiones HTTP" en la métrica de actividad
- [ ] D3.2 RED: test — `LogsTable` pinta nivel, mensaje y fecha; paginación dispara nueva petición con `page`/`pageSize`
- [ ] D3.3 RED: test — `LogsTable` con resultado vacío muestra un mensaje específico, distinto del estado de carga
- [ ] D3.4 RED: test — `AuditTable` pinta método, ruta, status, duración; filtro por status dispara nueva petición server-side
- [ ] D3.5 RED: test — `UsersTable` pinta email, tipo, rol, fecha de registro; nunca renderiza ningún campo de contraseña
- [ ] D3.6 RED: test — `KnowledgePanel` pinta el conteo de los tres índices y permite lanzar `POST /knowledge/search` mostrando resultados
- [ ] D3.7 GREEN: implementar `OverviewCards`, `LogsTable`, `AuditTable`, `UsersTable`, `KnowledgePanel` en `components/admin/`, todos sobre TanStack Query
- [ ] D3.8 REFACTOR: con la suite en verde — revisar que las cuatro tablas comparten `DataTableFilters` y no reimplementan cada una su propia paginación

### D4. Rutas file-based y enlace en `TopBar`

- [ ] D4.1 GREEN: crear `admin.index.tsx`, `admin.logs.tsx`, `admin.audit.tsx`, `admin.users.tsx`, `admin.knowledge.tsx` como hijas de `admin.tsx`
- [ ] D4.2 RED: test — `TopBar` no muestra el enlace a `/admin` si el usuario no es admin
- [ ] D4.3 RED: test — `TopBar` muestra el enlace a `/admin` si el usuario es admin
- [ ] D4.4 GREEN: implementar el enlace condicional
- [ ] D4.5 REFACTOR: con la suite en verde — confirmar que `TopBar` no duplica la lógica de guardia que ya vive en `admin.tsx`

## 5. Verificación manual

- [ ] 5.1 Arrancar con `ADMIN_EMAIL`/`ADMIN_PASSWORD` configuradas y comprobar que el admin puede loguearse y ver `/admin`
- [ ] 5.2 Loguearse con un usuario normal y comprobar que no aparece el enlace y que `/admin` por URL no muestra datos
- [ ] 5.3 Filtrar logs por nivel `error` y por fecha, comprobar en la pestaña de red que los parámetros llegan al servidor
- [ ] 5.4 Filtrar auditoría por status 500 y por ruta
- [ ] 5.5 Buscar un usuario por email parcial
- [ ] 5.6 Lanzar una búsqueda de prueba en `KnowledgePanel` y comparar el resultado con lo que devuelve el flujo de diagnóstico real para el mismo texto
- [ ] 5.7 Superar el rate limit de `/api/admin` y comprobar 429 sin afectar al login ni al diagnóstico

## 6. Cierre

- [ ] 6.1 `@security` sobre los endpoints `/api/admin/*`: control de acceso (401/403), validación Zod, rate limit, no exposición de `passwordHash`
- [ ] 6.2 `@reviewer` sobre el diff completo
- [ ] 6.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, también `pnpm test:ui`
- [ ] 6.4 `pnpm test:coverage`: Features ≥80% por archivo, Core 100%
- [ ] 6.5 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 6.6 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 6.7 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
