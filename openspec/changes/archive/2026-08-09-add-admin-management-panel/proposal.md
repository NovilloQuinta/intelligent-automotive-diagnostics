## Why

La aplicación ya escribe dos tablas de observabilidad y nadie las lee: `logs` (`Logger.saveToDb()`, todo nivel `debug`+) y `audit_logs` (`createAuditLogger`, cada petición HTTP con método, ruta, status, IP, duración y usuario). El catálogo vectorial en LanceDB (`pids_index`, `dtcs_index`, `diagnoses_index`) tampoco se puede inspeccionar desde ningún sitio: el puerto `VectorStore` solo expone `upsert`/`query`, pensado para el flujo RAG, no para un operador que quiera ver cuántas entradas hay o navegarlas.

Y no hay ningún concepto de administrador: `users.userType` distingue `individual`/`workshop`, pero ningún usuario tiene privilegios por encima de otro. Antes de publicar la web para el profesor conviene tener una pantalla de administración que dé visibilidad sobre logs, auditoría, usuarios y estado del conocimiento — hoy esa información solo es accesible abriendo el fichero SQLite a mano.

## What Changes

- **Rol de administrador**: columna `users.role` (`'user' | 'admin'`, default `'user'`); entidad `User` con `role` e `isAdmin`; seed idempotente de un admin desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` en el composition root.
- **Middleware `requireAdmin`**: carga el usuario por `req.userId` (ya puesto por `authMiddleware` desde el JWT) y corta con 403 si no es admin. El rol **no** viaja en el JWT — se resuelve en cada petición contra la base de datos.
- **Lectura de logs y auditoría**: `AuditLogRepository` gana `list(filter)`/`stats(range)`; nuevo puerto `LogRepository` para la tabla `logs`; `UserRepository` gana `list(filter)`/`stats()`. Todo paginado, filtrable y ordenado en SQL.
- **Visibilidad del catálogo vectorial**: `VectorStore` gana `count()` y `sample(limit)` para saber cuántas entradas hay por índice y poder inspeccionarlas sin re-implementar la búsqueda semántica en el panel.
- **Nuevos endpoints bajo `/api/admin`**, todos protegidos por `requireAdmin` y con su propio rate limiter: `GET /overview`, `GET /logs`, `GET /audit-logs`, `GET /users`, `GET /knowledge`, `POST /knowledge/search`.
- **Nueva sección `/admin` en la UI**: layout con guardia de rol, resumen (tarjetas), tabla de logs, tabla de auditoría, tabla de usuarios y panel de conocimiento vectorial. Reutiliza `@/components/ui/*` y TanStack Query; sin dependencias nuevas.
- **Enlace visible en `TopBar`** solo si el usuario autenticado es admin; `/api/auth/me` empieza a devolver `role`.

## Capabilities

### New Capabilities
- `admin-management-panel`: rol de administrador, lectura filtrada/paginada de logs de aplicación, auditoría HTTP, usuarios y estadísticas del catálogo vectorial, expuesta vía `/api/admin/*` y una sección `/admin` en la UI.

### Modified Capabilities
- `auth-endpoints`: `/api/auth/me` incluye `role` en la respuesta.

## Out of Scope

Persistir las consultas de diagnóstico y las llamadas al LLM **no** entra en este cambio. Eso se resolverá en un change aparte (`add-user-query-telemetry`, que absorberá `add-diagnosis-history` más una tabla `llm_queries`). Mientras ese change no exista, el overview de este panel deriva el volumen de consultas agrupando `audit_logs` por ruta — es una aproximación basada en tráfico HTTP, no en diagnósticos reales, y así debe quedar documentado en la UI.

## Dependencies

Depende de la autenticación existente (`auth-endpoints`, `auth-middleware`): `requireAdmin` se apoya en `req.userId`, que pone `authMiddleware` a partir del JWT.

No depende de `add-diagnosis-history` ni de `add-user-query-telemetry`. Si `add-user-query-telemetry` se implementa antes, el overview de este panel podrá cambiar su fuente de datos de `audit_logs` a la tabla real de consultas — es una mejora posterior, no un bloqueo.

## Impact

- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (+`users.role`), nueva migración Drizzle
- Modificado: `apps/core-api/src/domain/entities/user.ts` (+`role`, +`isAdmin`)
- Modificado: `apps/core-api/src/infrastructure/persistence/mappers/userMapper.ts`, `apps/core-api/src/application/shared/safeUser.ts`
- Nuevo: `apps/core-api/src/infrastructure/http/middleware/admin.middleware.ts`
- Modificado: `apps/core-api/src/infrastructure/composition/composition.ts` (+seed de admin)
- Modificado: `apps/core-api/src/application/ports/AuditLogRepository.ts`, `apps/core-api/src/application/ports/UserRepository.ts`, `apps/core-api/src/application/ports/VectorStore.ts`
- Nuevo: `apps/core-api/src/application/ports/LogRepository.ts`
- Nuevo: `apps/core-api/src/application/dto/admin/` (DTOs de filtro compartidos, Zod)
- Nuevo: `apps/core-api/src/application/use-cases/admin/` (`ListSystemLogsUseCase`, `ListAuditLogsUseCase`, `ListUsersUseCase`, `GetAdminOverviewUseCase`, `GetKnowledgeStatsUseCase`)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/auditLogRepository.ts`, `userRepository.ts`
- Nuevo: `apps/core-api/src/infrastructure/persistence/sqlite/logRepository.ts`
- Modificado: `apps/core-api/src/infrastructure/persistence/vector/lanceVectorStore.ts` (+`count`, +`sample`)
- Nuevo: `apps/core-api/src/infrastructure/http/controllers/AdminController.ts`, `apps/core-api/src/infrastructure/http/routes/admin.routes.ts`
- Modificado: `apps/core-api/src/infrastructure/http/server.ts` (montar `/api/admin`), `swagger.ts`
- Modificado: `apps/core-api/src/application/use-cases/GetCurrentUserUseCase.ts` (o su DTO de salida) para incluir `role`
- Nuevo: `apps/ui/src/routes/admin.tsx`, `admin.index.tsx`, `admin.logs.tsx`, `admin.audit.tsx`, `admin.users.tsx`, `admin.knowledge.tsx`
- Nuevo: `apps/ui/src/components/admin/` (`AdminLayout`, `OverviewCards`, `LogsTable`, `AuditTable`, `UsersTable`, `KnowledgePanel`, `DataTableFilters`)
- Modificado: `apps/ui/src/components/dashboard/TopBar.tsx` (enlace admin condicional), `apps/ui/src/lib/api.ts`
- Tests unitarios en `apps/core-api/tests/unit/`, integración en `apps/core-api/tests/integration/`, unit UI en `apps/ui/tests/unit/`
