# Admin Management Panel

## Purpose

Dar visibilidad operativa sobre logs de aplicación, auditoría HTTP, usuarios y catálogo vectorial mediante un rol de administrador, endpoints protegidos bajo `/api/admin` y una sección `/admin` en la UI. No persiste consultas de diagnóstico ni llamadas al LLM — eso queda fuera de alcance.

## Requirements

### Requirement: Rol de administrador
El sistema SHALL distinguir usuarios administradores mediante una columna `role` en `users`, con valor por defecto `'user'`.

#### Scenario: Usuario normal por defecto
- **GIVEN** un registro nuevo a través de `RegisterUserUseCase`
- **WHEN** se crea el usuario
- **THEN** su `role` es `'user'`
- **AND** `isAdmin` es `false`

#### Scenario: Seed idempotente del primer administrador
- **GIVEN** las variables de entorno `ADMIN_EMAIL` y `ADMIN_PASSWORD` configuradas
- **WHEN** arranca la aplicación y no existe ningún usuario con ese email
- **THEN** se crea un usuario con `role: 'admin'` y la contraseña hasheada con el mismo mecanismo que `AuthService`

#### Scenario: El seed no duplica ni sobrescribe
- **GIVEN** que ya existe un usuario con el email de `ADMIN_EMAIL`
- **WHEN** arranca la aplicación de nuevo
- **THEN** no se crea un segundo usuario ni se modifica la contraseña existente

#### Scenario: Seed ausente sin romper el arranque
- **GIVEN** que `ADMIN_EMAIL` o `ADMIN_PASSWORD` no están configuradas
- **WHEN** arranca la aplicación
- **THEN** el arranque continúa con normalidad
- **AND** se registra una advertencia, sin excepción propagada

---

### Requirement: Middleware de autorización de administrador
El sistema SHALL exponer `createRequireAdmin(userRepo)`, un middleware que carga el usuario autenticado por `req.userId` y bloquea el acceso si no es administrador.

#### Scenario: Sin autenticación previa
- **GIVEN** una petición a una ruta protegida por `requireAdmin` sin `req.userId` (sin pasar por `authMiddleware`)
- **WHEN** se procesa la petición
- **THEN** responde 401

#### Scenario: Usuario autenticado sin rol admin
- **GIVEN** un usuario autenticado con `role: 'user'`
- **WHEN** accede a una ruta bajo `requireAdmin`
- **THEN** responde 403

#### Scenario: Usuario administrador
- **GIVEN** un usuario autenticado con `role: 'admin'`
- **WHEN** accede a una ruta bajo `requireAdmin`
- **THEN** la petición continúa al siguiente middleware o controlador

#### Scenario: El rol no se lee del JWT
- **GIVEN** un token válido que solo contiene `sub`
- **WHEN** `requireAdmin` evalúa la petición
- **THEN** el rol se determina consultando `userRepo.findById(req.userId)`, nunca decodificando un claim de rol del token

---

### Requirement: Lectura filtrada y paginada de logs de aplicación
El sistema SHALL exponer `GET /api/admin/logs`, protegido por `requireAdmin`, con filtros `level`, `from`, `to`, `q`, y paginación `page`/`pageSize` con tope de 100.

#### Scenario: Listado sin filtros
- **GIVEN** un administrador autenticado y logs existentes
- **WHEN** hace `GET /api/admin/logs`
- **THEN** responde 200 con la primera página ordenada por fecha descendente y el total de coincidencias

#### Scenario: Filtro por nivel
- **GIVEN** logs de niveles mixtos
- **WHEN** hace `GET /api/admin/logs?level=error`
- **THEN** responde solo con entradas de nivel `error`

#### Scenario: `pageSize` por encima del tope
- **GIVEN** una petición con `pageSize=500`
- **WHEN** se valida con el esquema Zod
- **THEN** responde 400, o se acota a 100 — el comportamiento exacto lo fija el esquema de validación, pero nunca se ejecuta una consulta con más de 100 filas por página

#### Scenario: Acceso sin rol admin
- **GIVEN** un usuario autenticado sin rol admin
- **WHEN** hace `GET /api/admin/logs`
- **THEN** responde 403

---

### Requirement: Lectura filtrada y paginada de auditoría HTTP
El sistema SHALL exponer `GET /api/admin/audit-logs`, protegido por `requireAdmin`, con filtros `statusCode`, `path`, `userId`, `from`, `to`, `q`, y paginación.

#### Scenario: Listado sin filtros
- **GIVEN** registros de auditoría existentes
- **WHEN** un administrador hace `GET /api/admin/audit-logs`
- **THEN** responde 200 con la primera página ordenada por fecha descendente y el total

#### Scenario: Filtro por status y ruta
- **GIVEN** registros con distintos `statusCode` y `path`
- **WHEN** se hace `GET /api/admin/audit-logs?statusCode=500&path=/api/diagnosis`
- **THEN** responde solo con registros que cumplen ambos filtros

#### Scenario: Estadísticas de auditoría por rango
- **GIVEN** un rango de fechas
- **WHEN** se solicitan las estadísticas de auditoría para ese rango
- **THEN** se devuelve un resumen agregado (p. ej. peticiones por status, por ruta) sin exponer las filas individuales

---

### Requirement: Lectura filtrada y paginada de usuarios
El sistema SHALL exponer `GET /api/admin/users`, protegido por `requireAdmin`, con filtro de texto `q` sobre email/username, rango de fechas de registro, y paginación.

#### Scenario: Listado nunca expone el hash de contraseña
- **GIVEN** usuarios existentes en la base de datos
- **WHEN** un administrador hace `GET /api/admin/users`
- **THEN** cada entrada de la respuesta omite `passwordHash`, usando la misma proyección que `safeUser`

#### Scenario: Búsqueda por texto
- **GIVEN** usuarios con distintos emails
- **WHEN** se hace `GET /api/admin/users?q=taller`
- **THEN** responde solo con usuarios cuyo email o username contiene ese texto

#### Scenario: Estadísticas de usuarios
- **GIVEN** usuarios con distintos `userType` y `role`
- **WHEN** se solicitan las estadísticas de usuarios
- **THEN** se devuelve un resumen agregado (totales por tipo y por rol)

---

### Requirement: Visibilidad del catálogo vectorial
El sistema SHALL exponer `GET /api/admin/knowledge`, protegido por `requireAdmin`, con el conteo y una muestra de entradas de cada índice (`pids_index`, `dtcs_index`, `diagnoses_index`).

#### Scenario: Resumen del catálogo
- **GIVEN** los tres índices poblados
- **WHEN** un administrador hace `GET /api/admin/knowledge`
- **THEN** responde 200 con el número de entradas de cada índice y una muestra limitada de filas por índice

#### Scenario: Búsqueda semántica de prueba
- **GIVEN** un texto de búsqueda
- **WHEN** un administrador hace `POST /api/admin/knowledge/search` con ese texto y el índice objetivo
- **THEN** responde con las coincidencias que devolvería el flujo RAG real para esa consulta, usando el mismo `VectorStore.query()`

---

### Requirement: Resumen general del panel
El sistema SHALL exponer `GET /api/admin/overview`, protegido por `requireAdmin`, con métricas agregadas de usuarios, logs de error recientes y actividad HTTP.

#### Scenario: Overview con datos disponibles
- **GIVEN** usuarios, logs y auditoría existentes
- **WHEN** un administrador hace `GET /api/admin/overview`
- **THEN** responde 200 con totales de usuarios, conteo de errores recientes, y actividad HTTP agrupada por ruta como proxy de volumen de consultas

#### Scenario: La métrica de actividad no se presenta como diagnósticos reales
- **GIVEN** la respuesta de `GET /api/admin/overview`
- **WHEN** se examina el campo de actividad de diagnóstico
- **THEN** su nombre y su documentación en Swagger indican que se deriva de peticiones HTTP a `audit_logs`, no de diagnósticos persistidos

---

### Requirement: Todas las rutas de administración exigen rol admin y limitan tasa
El sistema SHALL proteger cada ruta bajo `/api/admin` con `requireAdmin` y un rate limiter propio, independiente del resto de la API.

#### Scenario: Rate limit propio del panel
- **GIVEN** un administrador autenticado
- **WHEN** excede el número de peticiones permitidas en la ventana configurada para `/api/admin`
- **THEN** responde 429, sin afectar al límite de `/api/diagnosis` ni al de `/api/auth`

---

### Requirement: Sección de administración en la interfaz
El sistema SHALL ofrecer una sección `/admin` en la UI, visible solo para usuarios con rol admin, con vistas de resumen, logs, auditoría, usuarios y catálogo de conocimiento.

#### Scenario: Enlace visible solo para administradores
- **GIVEN** un usuario autenticado sin rol admin
- **WHEN** se renderiza `TopBar`
- **THEN** no se muestra ningún enlace a `/admin`

#### Scenario: Guardia de ruta
- **GIVEN** un usuario autenticado sin rol admin
- **WHEN** navega directamente a `/admin` por URL
- **THEN** la ruta lo redirige o le muestra un mensaje de acceso denegado, sin cargar los datos administrativos

#### Scenario: Filtros server-side en cada tabla
- **GIVEN** cualquiera de las tablas de administración (logs, auditoría, usuarios)
- **WHEN** el usuario cambia un filtro o de página
- **THEN** se dispara una nueva petición al endpoint correspondiente con esos parámetros, sin filtrar ni paginar en el navegador

#### Scenario: Estado vacío por tabla
- **GIVEN** una tabla de administración sin resultados para el filtro aplicado
- **WHEN** se renderiza
- **THEN** muestra un mensaje específico de esa tabla, no una tabla vacía sin contexto

---

### Requirement: `/api/auth/me` incluye el rol
El sistema SHALL incluir el campo `role` en la respuesta de `GET /api/auth/me`, para que la UI pueda decidir si mostrar la sección de administración.

#### Scenario: Usuario normal
- **GIVEN** un usuario con `role: 'user'` autenticado
- **WHEN** hace `GET /api/auth/me`
- **THEN** la respuesta incluye `"role": "user"`

#### Scenario: Usuario administrador
- **GIVEN** un usuario con `role: 'admin'` autenticado
- **WHEN** hace `GET /api/auth/me`
- **THEN** la respuesta incluye `"role": "admin"`
