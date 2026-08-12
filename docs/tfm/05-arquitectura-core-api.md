# 5. Arquitectura del Backend Core API

> **Fichero**: `apps/core-api/`  
> **Arquitectura**: Clean Architecture + Hexagonal (Ports & Adapters)  
> **Lenguaje**: TypeScript estricto (`strict: true`)  
> **Fecha de análisis**: 2026-08-09 (código real de la rama `develop`)

---

## 5.1. Visión General

El backend `core-api` es la pieza central del sistema _Intelligent Automotive Diagnostics_. Implementa una arquitectura en **tres capas** siguiendo los principios de Clean Architecture de Robert C. Martin y el patrón Hexagonal (Ports & Adapters) de Alistair Cockburn. Esta arquitectura permite que la lógica de negocio automotriz sea completamente independiente del framework HTTP, la base de datos, el proveedor de IA o el mecanismo de conexión al vehículo.

### 5.1.1. Diagrama de capas

```
┌─────────────────────────────────────────────────────────────────┐
│                     INFRASTRUCTURE (externa)                     │
│                                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────────────────┐  │
│  │ HTTP/Express  │ │ Persistence  │ │  Adaptadores externos   │  │
│  │ controllers/  │ │ SQLite/Drizzl│ │  MCP, LLM, WebSearch,   │  │
│  │ routes/       │ │ Vector/Lance │ │  ELM327, Simulador OBD  │  │
│  │ middleware/   │ │ (repos)      │ │                         │  │
│  └──────┬───────┘ └──────┬───────┘ └────────────┬────────────┘  │
│         │                │                       │               │
│         ▼                ▼                       ▼               │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │              APPLICATION (intermedia)                     │    │
│  │                                                          │    │
│  │  ┌───────────────┐  ┌────────────┐  ┌─────────────────┐  │    │
│  │  │  Use Cases    │  │   Ports    │  │  DTOs / Shared   │  │    │
│  │  │  (execute())  │  │ (interface)│  │  (puro, sin IO)  │  │    │
│  │  └───────┬───────┘  └─────┬──────┘  └─────────────────┘  │    │
│  │          │                │                               │    │
│  └──────────┼────────────────┼───────────────────────────────┘    │
│             │ importa        │ importa                            │
│             ▼                ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │                 DOMAIN (interna)                          │    │
│  │                                                          │    │
│  │  ┌───────────────┐  ┌─────────────────────────────────┐  │    │
│  │  │  Entities     │  │  Value Objects                  │  │    │
│  │  │  (con id)     │  │  (inmutables, sin identidad)    │  │    │
│  │  │  User,        │  │  Email, Vin, PidCode, Formula,  │  │    │
│  │  │  VehicleProfi │  │  DtcCode, LiveData, Diagnosis-  │  │    │
│  │  │  Diagnosis-   │  │  Result, VehicleInfo, Vehicle-  │  │    │
│  │  │  Session,     │  │  Status, FreezeFrame,           │  │    │
│  │  │  EcuInfo,     │  │  KnowledgeSource               │  │    │
│  │  │  PidDefinition│  │                                 │  │    │
│  │  │  PidReading   │  │                                 │  │    │
│  │  └───────────────┘  └─────────────────────────────────┘  │    │
│  │                                                          │    │
│  │  ┌───────────────┐  ┌─────────────────────────────────┐  │    │
│  │  │  Catálogos    │  │  Constantes OBD-II              │  │    │
│  │  │  dtcCatalog   │  │  pids.ts (modos, PIDs J1979)   │  │    │
│  │  │  pidObservat  │  │  pidFormulaEntry.ts             │  │    │
│  │  └───────────────┘  └─────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘

          ◄─── FLUJO DE DEPENDENCIAS (las flechas apuntan al origen)
               domain ← application ← infrastructure
```

**Regla inviolable**: `domain/` no importa nada de fuera; `application/` solo importa de `domain/`; `infrastructure/` implementa los contratos (`ports`) definidos en `application/` y se inyecta desde el _composition root_.

---

## 5.2. Stack Tecnológico

| Componente | Tecnología | Versión | Propósito |
|---|---|---|---|
| **Runtime** | Node.js (tsx) | 22+ | Ejecución TypeScript sin compilación previa en dev |
| **Framework HTTP** | Express | 5.1.0 | Servidor web, routing, middleware |
| **ORM** | Drizzle ORM | 0.45.2 | Type-safe SQL queries, migraciones, schema en TypeScript |
| **Base de datos** | SQLite (better-sqlite3) | 12.11.1 | Persistencia local, WAL mode, zero-config |
| **Migraciones** | drizzle-kit | 0.31.10 | Generación y ejecución de migraciones SQL |
| **Validación** | Zod | 3.24.0 | Schemas para input externo (HTTP body/query/params, JWT payloads) |
| **Auth / Hashing** | bcrypt + jsonwebtoken | 6.0 / 9.0 | Password hashing (12 rounds), JWT access + refresh tokens |
| **Rate Limiting** | express-rate-limit | 8.6.0 | Rate limiting por IP con headers estándar |
| **Seguridad HTTP** | helmet | 8.3.0 | Cabeceras de seguridad (CSP, HSTS, frameguard) |
| **CORS** | cors | 2.8.6 | Allowlist configurable de orígenes |
| **Logging** | pino + pino-pretty | 10.3 / 13.1 | Logging estructurado con persistencia en tabla `logs` |
| **Swagger** | swagger-jsdoc / swagger-ui-express | 6.3 / 5.0 | Documentación OpenAPI 3.0 interactiva |
| **Vector DB** | LanceDB | 0.31.0 | Base vectorial embebida para RAG (PID, DTC, diagnósticos) |
| **Embeddings** | @xenova/transformers | 2.17.2 | Generación de embeddings locales (sin API externa) |
| **LLM** | Anthropic SDK / OpenAI SDK | 0.115 / 6.49 | Clientes para diagnóstico cognitivo con IA |
| **MCP** | @modelcontextprotocol/sdk | 1.30.0 | Protocolo MCP para exponer herramientas al LLM |
| **Web Search** | SerpAPI (custom impl) | - | Búsqueda web para enriquecer el diagnóstico |
| **Tests** | Vitest + Supertest | 3.0 / 7.2 | Tests unitarios (Vitest), tests de integración HTTP (Supertest) |

---

## 5.3. Capas Detalladas

### 5.3.1. Capa de Dominio (`domain/`)

La capa más interna. No tiene dependencias externas. Contiene:

#### Entidades (6 ficheros)
Entidades con identidad (`id: number` obligatorio) y validación en constructor:

| Entidad | Fichero | Propósito |
|---|---|---|
| `User` | `entities/user.ts` | Usuario (particular o taller) con email, password_hash, rol (user/admin), bloqueo por intentos |
| `VehicleProfile` | `entities/vehicleProfile.ts` | Perfil completo de vehículo (VIN, marca, modelo, año, motor) |
| `DiagnosisSession` | `entities/diagnosisSession.ts` | Sesión de diagnóstico vinculada a vehículo y escenario |
| `EcuInfo` | `entities/ecuInfo.ts` | ECU descubierta en el bus CAN (nombre, direcciones, protocolo) |
| `PidDefinition` | `entities/pidDefinition.ts` | Definición de un PID OBD-II (modo, código, fórmula, confianza) |
| `PidReading` | `entities/pidReading.ts` | Lectura histórica de un PID (raw hex + valor parseado) |

#### Value Objects (11 ficheros)
Objetos inmutables sin identidad, con validación en constructor:

| Value Object | Fichero | Propósito |
|---|---|---|
| `Email` | `value-objects/email.ts` | Email validado (regex + lowercase + trim) |
| `Vin` | `value-objects/vin.ts` | VIN ISO 3779 (17 caracteres, validación de checksum) |
| `PidCode` | `value-objects/pidCode.ts` | Par modo+PID (ej. `01 0C`) con formato canónico |
| `Formula` | `value-objects/formula.ts` | Fórmula de conversión PID (ej. `A*256+B`) |
| `DtcCode` | `value-objects/dtcCode.ts` | Código DTC SAE J2012 (ej. `P0301`) |
| `LiveData` | `value-objects/liveData.ts` | Telemetría en vivo (RPM, temperatura, velocidad, etc.) |
| `DiagnosisResult` | `value-objects/diagnosisResult.ts` | Resultado de diagnóstico (severidad derivada del estado) |
| `VehicleInfo` | `value-objects/vehicleInfo.ts` | Datos de identificación del vehículo (marca, modelo, VIN) |
| `VehicleStatus` | `value-objects/vehicleStatus.ts` | Estado MIL + monitores de emisiones (Mode 01 PID 01) |
| `FreezeFrame` | `value-objects/freezeFrame.ts` | Fotograma congelado OBD-II asociado a un DTC |
| `KnowledgeSource` | `value-objects/knowledgeSource.ts` | Procedencia de un dato del catálogo (manual/auto-aprendizaje/LLM) |

#### Catálogos y Constantes
- **`pids.ts`**: Constantes de modos OBD-II (`MODE_CURRENT_DATA = '01'`, `MODE_PROPRIETARY = '22'`) y PIDs estándar (`PID_RPM = '0C'`, `PID_COOLANT_TEMP = '05'`, etc.)
- **`dtcCatalog.ts`**: Subconjunto del catálogo SAE J2012 (P0xxx estándar con descripciones). Los DTCs manufacturer-specific (P1xxx/P2xxx) viven en la BD (`dtc_definitions`, `source: 'seed'`). Un código ausente devuelve `description: ''` — el LLM y el índice vectorial completan el hueco.

### 5.3.2. Capa de Aplicación (`application/`)

Orquesta la lógica de negocio. Depende solo de `domain/`.

#### Puertos (19 interfaces)
Definen los contratos que `infrastructure/` debe implementar:

| Puerto | Propósito |
|---|---|
| `UserRepository` | CRUD de usuarios, bloqueo por intentos, listado admin |
| `VehicleRepository` | CRUD de vehículos, ECUs, PIDs, sesiones de diagnóstico |
| `ObdRepository` | Lectura de datos OBD-II (telemetría, DTCs, VIN, clear) |
| `AuditLogRepository` | Escritura y consulta de logs de auditoría HTTP |
| `LogRepository` | Consulta de logs de aplicación para panel admin |
| `RefreshTokenRepository` | Almacenamiento y revocación de refresh tokens |
| `AuthServicePort` | Hashing bcrypt + generación/verificación de JWT |
| `LlmClientPort` | Cliente LLM (Anthropic u OpenAI) para diagnóstico cognitivo |
| `KnowledgeStack` | Acceso a los índices vectoriales (PIDs, DTCs, diagnósticos) |
| `EmbeddingGenerator` | Generación de embeddings para búsqueda semántica |
| `VectorStore` | Almacén vectorial genérico (usado por LanceDB) |
| `WebSearchPort` | Búsqueda web externa |
| `LoggerPort` | Interfaz de logging (debug, info, warn, error) |
| `ToolCallHandler` | Handler de tools MCP durante diagnóstico cognitivo |
| `PidFormulaCatalog` | Catálogo de fórmulas PID |
| `PidVectorRepository` | Repositorio vectorial de PIDs |
| `DtcVectorRepository` | Repositorio vectorial de DTCs |
| `DiagnosisVectorRepository` | Repositorio vectorial de diagnósticos |
| `VectorRepository` | Repositorio vectorial genérico |

#### Casos de Uso (15 ficheros)
Clases con método `execute()`, dependencias inyectadas por constructor:

| Caso de uso | Fichero | Propósito |
|---|---|---|
| `RegisterUserUseCase` | `RegisterUserUseCase.ts` | Registro con validación Zod, hashing bcrypt, tokens JWT |
| `LoginUserUseCase` | `LoginUserUseCase.ts` | Login con bloqueo tras 5 intentos fallidos (15 min) |
| `RefreshTokenUseCase` | `RefreshTokenUseCase.ts` | Rotación de refresh token (revoca el viejo, emite nuevo) |
| `GetCurrentUserUseCase` | `GetCurrentUserUseCase.ts` | Obtener perfil desde JWT (`/api/auth/me`) |
| `LogoutUserUseCase` | `LogoutUserUseCase.ts` | Revocación de refresh token |
| `ProcessVehicleDiagnosisUseCase` | `ProcessVehicleDiagnosisUseCase.ts` | Diagnóstico determinista OBD-II |
| `ExecuteCognitiveDiagnosisUseCase` | `ExecuteCognitiveDiagnosisUseCase.ts` | Diagnóstico LLM con tool calling MCP |
| `ExecuteLlmToolCalling` | `ExecuteLlmToolCalling.ts` | Bucle de tool calling LLM (máx. iteraciones) |
| `ValidateDiscoveredPidUseCase` | `ValidateDiscoveredPidUseCase.ts` | Validación de PIDs auto-descubiertos |
| `ValidateDiscoveredDtcUseCase` | `ValidateDiscoveredDtcUseCase.ts` | Validación de DTCs auto-descubiertos |
| `GetAdminOverviewUseCase` | `admin/GetAdminOverviewUseCase.ts` | Resumen del panel admin |
| `ListSystemLogsUseCase` | `admin/ListSystemLogsUseCase.ts` | Logs paginados/filtrados |
| `ListAuditLogsUseCase` | `admin/ListAuditLogsUseCase.ts` | Auditoría HTTP paginada/filtrada |
| `ListUsersUseCase` | `admin/ListUsersUseCase.ts` | Usuarios paginados/filtrados (sin passwordHash) |
| `GetKnowledgeStatsUseCase` | `admin/GetKnowledgeStatsUseCase.ts` | Estadísticas del catálogo vectorial |

#### DTOs (Data Transfer Objects)
Un fichero por DTO en `application/dto/`, organizados por dominio: `auth/`, `admin/`, `diagnosis/`, `audit/`, `llm/`, `knowledge/`, `vector/`, `web-search/`.

### 5.3.3. Capa de Infraestructura (`infrastructure/`)

Implementa los puertos de `application/ports/` y contiene todo el código de frameworks, drivers y adaptadores externos.

#### Composition Root
**`composition/composition.ts`** (412 líneas) es el punto único de cableado:
1. Carga configuración validada con Zod (`configuration/index.ts`)
2. Abre conexión SQLite singleton (`persistence/sqlite/db.ts`)
3. Instancia repositorios concretos: `SqliteUserRepository`, `SqliteVehicleRepository`, `SqliteAuditLogRepository`, `SqliteLogRepository`, `SqliteRefreshTokenStore`
4. Crea el servicio de autenticación (`AuthServicePort` con bcrypt + JWT)
5. Siembra el usuario admin desde `ADMIN_EMAIL`/`ADMIN_PASSWORD` (idempotente)
6. Instancia casos de uso (auth + diagnosis + admin)
7. Crea controladores Express (`AuthController`, `DiagnosisController`, `AdminController`)
8. Inicializa LanceDB y los índices vectoriales (graceful degradation si no disponible)
9. Crea el cliente LLM según `LLM_PROVIDER` (anthropic/openai)
10. Crea `DiagnosisService` con mapa de escenarios o conexión directa TCP
11. Devuelve la app Express con todas las rutas montadas

#### Servidor HTTP (`http/server.ts`)
- **Express 5** como framework base (228 líneas)
- **Helmet** con CSP estricta (`default-src: 'none'`), HSTS, frameguard `deny`
- **CORS** con allowlist de orígenes (configurable vía `ALLOWED_ORIGINS`)
- **Rate limiting** global (100 req/15min) con límites específicos por ruta
- **Audit logger** para todas las rutas (excepto `/api/admin/*` — autoexclusión)
- **x-request-id** por petición para correlación de trazas
- **Express JSON parser** con límite `10kb`
- **Error handler global** que responde 500 sin filtrar detalles internos

### 5.3.4. Inversión de Dependencias

El _composition root_ (`buildApp()`) es el único punto donde se instancian clases concretas. Los casos de uso reciben sus dependencias por constructor como interfaces (puertos), nunca como implementaciones concretas:

```
RegisterUserUseCase(UserRepository, AuthServicePort, RefreshTokenRepository, LoggerPort)
                          ↑                ↑                    ↑                  ↑
                          │                │                    │                  │
         SqliteUserRepository    createAuthService()   SqliteRefreshTokenStore   Logger
         (implementa UserRepo)   (implementa AuthPort)  (implementa TokenRepo)   (implementa LoggerPort)
```

Esto permite:
- **Testear casos de uso con mocks** sin levantar Express ni SQLite
- **Cambiar de base de datos** (SQLite → PostgreSQL) sin tocar un solo caso de uso
- **Cambiar de framework HTTP** (Express → Fastify) desde un solo punto
- **Cambiar de proveedor LLM** (Anthropic ↔ OpenAI) por variable de entorno

---

## 5.4. API REST — Endpoints Completos

### 5.4.1. Autenticación (`/api/auth/*`)

Rate limit base: 20 req / 15 min. Login y refresh tienen límites más estrictos. Las rutas `/api/auth` se montan **antes** del middleware de autenticación global (no requieren token).

| Método | Ruta | Rate Limit | Propósito |
|---|---|---|---|
| `POST` | `/api/auth/register` | 20/15min | Registro de usuario (individual o taller) |
| `POST` | `/api/auth/login` | 5/1min | Login con email + password → tokens JWT. Bloqueo tras 5 fallos |
| `POST` | `/api/auth/refresh` | 10/1min | Rotación de refresh token (revoca el viejo) |
| `GET` | `/api/auth/me` | 20/15min | Perfil del usuario autenticado (requiere JWT) |
| `POST` | `/api/auth/logout` | 20/15min | Revoca el refresh token (cierre de sesión) |

### 5.4.2. Diagnóstico (`/api/*`)

Rate limit: 20 req / 1 min (general), 5 req / 1 min (cognitivo y clear-dtc), 1 req / 1 s (live-data). **Todas requieren JWT** (montadas después del `authMiddleware` global).

| Método | Ruta | Rate Limit | Propósito |
|---|---|---|---|
| `GET` | `/api/scenarios` | 20/1min | Listar escenarios de vehículo disponibles |
| `GET` | `/api/mcp/capabilities` | 20/1min | Informar si el diagnóstico cognitivo está disponible |
| `POST` | `/api/diagnosis` | 20/1min | Ejecutar diagnóstico determinista sobre un escenario |
| `GET` | `/api/freeze-frame` | 20/1min | Obtener freeze frame para un DTC y escenario |
| `GET` | `/api/ecu-info` | 20/1min | Listar ECUs descubiertas en el vehículo |
| `GET` | `/api/vehicle-info` | 20/1min | Identificar vehículo (VIN, marca, modelo, año) |
| `GET` | `/api/live-data` | 1/1s | Telemetría en vivo (RPM, temperatura, velocidad) |
| `POST` | `/api/mcp/tools/:toolName` | 20/1min | Invocar una tool MCP directamente (sin LLM) |
| `POST` | `/api/mcp/cognitive-diagnosis` | 5/1min | Diagnóstico cognitivo con LLM (más caro) |
| `POST` | `/api/clear-dtc` | 5/1min | Borrar DTCs almacenados (Mode 04) |
| `GET` | `/api/pending-dtc` | 20/1min | Leer DTCs pendientes (Mode 07) |
| `GET` | `/api/permanent-dtc` | 20/1min | Leer DTCs permanentes (Mode 0A) |
| `GET` | `/api/vehicle-status` | 20/1min | Estado MIL + monitores de emisiones (Mode 01 PID 01) |

### 5.4.3. Administración (`/api/admin/*`)

Rate limit: 30 req / 1 min (independiente del resto). **Requiere JWT + rol `admin`** (middleware `requireAdmin` consulta la BD en cada petición, no confía en el claim del token). Auto-excluidas de auditoría.

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api/admin/overview` | Resumen: usuarios por tipo/rol, errores 24h, actividad HTTP |
| `GET` | `/api/admin/logs` | Logs de aplicación paginados/filtrados (nivel, fecha, texto) |
| `GET` | `/api/admin/audit-logs` | Auditoría HTTP paginada/filtrada (status, path, userId, fecha) |
| `GET` | `/api/admin/users` | Usuarios paginados/filtrados (sin passwordHash) |
| `GET` | `/api/admin/knowledge` | Estadísticas de los índices vectoriales (count + sample) |
| `POST` | `/api/admin/knowledge/search` | Búsqueda semántica de prueba contra el catálogo vectorial |

### 5.4.4. Información y Health

| Método | Ruta | Propósito |
|---|---|---|
| `GET` | `/api-docs` | Swagger UI interactiva (solo en desarrollo) |
| `GET` | `/api-docs.json` | Especificación OpenAPI 3.0 en JSON |
| `GET` | `/` | Redirección a `/api-docs` |
| `GET` | `/api` | Redirección a `/api-docs` |
| `GET` | `/health` | Health check: `{ status: "ok", uptime }` |

### 5.4.5. Documentación OpenAPI / Swagger

La especificación OpenAPI 3.0.3 completa está definida en `swagger.ts` (1058 líneas) como un objeto `const`. Incluye:

- **3 tags**: Auth, Diagnosis, Admin
- **22 endpoints** documentados con request/response schemas
- **Esquemas completos**: RegisterRequest, LoginRequest, TokenPair, UserProfile, Scenario, LiveData, DtcCode, VehicleInfo, DiagnosisResult, FreezeFrame, EcuInfo, y todos los schemas de admin (AdminOverview, AdminLogEntry, AdminAuditLogEntry, AdminUserEntry, KnowledgeStats, etc.)
- **Seguridad**: `bearerAuth` (HTTP Bearer JWT) como security scheme global
- Swagger UI disponible en `/api-docs` (solo entornos no producción)

---

## 5.5. Persistencia

### 5.5.1. Base de datos: SQLite + WAL

- **Motor**: SQLite via `better-sqlite3` (driver síncrono de alto rendimiento)
- **Modo**: WAL (Write-Ahead Logging) para lecturas concurrentes sin bloquear escrituras
- **Foreign keys**: Activadas (`PRAGMA foreign_keys = ON`)
- **ORM**: Drizzle ORM con schema type-safe en TypeScript (`schema.ts`, 118 líneas)
- **Migraciones**: `drizzle-kit generate` → `drizzle-kit migrate` automático al arrancar
- **Ruta por defecto**: `data/diagnostics.db` (configurable vía `DB_PATH`)

### 5.5.2. Esquema de Base de Datos (10 tablas)

```
┌──────────────────────────────────────────────────────────────────────────┐
│                               DATABASE                                   │
│                                                                          │
│  vehicles ───────────┬─ ecus                                             │
│  id (PK)             │  id (PK), vehicle_id (FK→vehicles.id)             │
│  vin (UNIQUE)        │  name, request_addr, response_addr, type,         │
│  make, model         │  protocol, discovered_at                          │
│  year, engine_type   │                                                   │
│  first_seen, last_seen│─ pid_definitions                                 │
│                       │  id (PK), vehicle_id (FK), ecu_id (FK)           │
│                       │  mode, pid_code, name, description               │
│                       │  formula, unit, data_bytes, pid_type             │
│                       │  min_value, max_value, confidence, source,       │
│                       │  created_at                                      │
│                       │                                                  │
│                       │─ pid_readings                                    │
│                       │  id (PK), pid_def_id (FK), session_id            │
│                       │  raw_hex, parsed_value, timestamp                │
│                       │                                                  │
│                       └─ diagnosis_sessions                              │
│                          id (PK), vehicle_id (FK), scenario_id           │
│                          started_at, ended_at                            │
│                                                                          │
│  users ─────────────── refresh_tokens                                    │
│  id (PK)               id (PK), user_id (FK→users.id)                    │
│  username (UNIQUE)     token_hash (UNIQUE), expires_at                   │
│  email (UNIQUE)        created_at, revoked_at                            │
│  password_hash                                                           │
│  user_type ('individual'│'workshop')                                     │
│  role ('user'│'admin')                                                   │
│  business_name, tax_id, address                                         │
│  created_at                                                              │
│  failed_login_attempts, locked_until                                     │
│                                                                          │
│  audit_logs ────────── logs                                              │
│  id (PK)               id (PK)                                           │
│  method, path          level ('debug'│'info'│'warn'│'error')              │
│  status_code           message                                            │
│  ip, user_agent        context (JSON)                                    │
│  duration_ms           created_at                                        │
│  user_id                                                                 │
│  created_at                                                              │
└──────────────────────────────────────────────────────────────────────────┘
```

| # | Tabla | Propósito |
|---|---|---|
| 1 | **vehicles** | Vehículos detectados por VIN (ISO 3779). `first_seen`/`last_seen` para tracking. |
| 2 | **ecus** | ECUs descubiertas en el bus CAN (módulo motor, transmisión, ABS...). Vinculada a `vehicle_id`. |
| 3 | **pid_definitions** | Catálogo auto-expansivo de definiciones de PID (SAE J1979 + propietarios Mode 22). Con fórmula, unidad, confianza y fuente (manual/auto-aprendizaje/LLM). |
| 4 | **pid_readings** | Histórico de lecturas de PIDs con valor en crudo (hex) y parseado (numérico). Vinculado a sesión de diagnóstico. |
| 5 | **diagnosis_sessions** | Sesiones de diagnóstico (inicio, fin, vehículo, escenario). |
| 6 | **users** | Usuarios registrados (particulares y talleres). Con `role` (user/admin), `failed_login_attempts`, `locked_until`. |
| 7 | **refresh_tokens** | Tokens de refresco hasheados con fecha de expiración y revocación. |
| 8 | **audit_logs** | Auditoría HTTP completa (método, ruta, status, IP, duración, userId). |
| 9 | **logs** | Logs de aplicación (nivel, mensaje, contexto JSON). Persistidos por el logger pino. |

### 5.5.3. Repositorios SQLite (4 ficheros)

| Repositorio | Fichero | Puerto implementado |
|---|---|---|
| `SqliteUserRepository` | `sqlite/userRepository.ts` | `UserRepository` |
| `SqliteVehicleRepository` | `sqlite/vehicleRepository.ts` | `VehicleRepository` |
| `SqliteAuditLogRepository` | `sqlite/auditLogRepository.ts` | `AuditLogRepository` |
| `SqliteLogRepository` | `sqlite/logRepository.ts` | `LogRepository` |
| `SqliteRefreshTokenStore` | `sqlite/refreshTokenStore.ts` | `RefreshTokenRepository` |

### 5.5.4. Mappers (3 ficheros)

Traducen entre filas Drizzle (tipos inferidos del schema) y entidades/values del dominio:

| Mapper | Fichero | Traducción |
|---|---|---|
| `userMapper` | `persistence/mappers/userMapper.ts` | `UserRow` ↔ `User` (entidad), `CreateUserInput` ↔ valores INSERT |
| `auditLogMapper` | `persistence/mappers/auditLogMapper.ts` | `CreateAuditLogInput` ↔ valores INSERT |
| `refreshTokenMapper` | `persistence/mappers/refreshTokenMapper.ts` | `RefreshTokenRow` ↔ `RefreshTokenRecord` |

---

## 5.6. Seguridad

### 5.6.1. Autenticación JWT (doble token)

```
ACCESS TOKEN                          REFRESH TOKEN
─────────────                         ──────────────
• TTL: 15 minutos                     • TTL: 7 días
• Secreto: ACCESS_TOKEN_SECRET        • Secreto: REFRESH_TOKEN_SECRET
• Payload: { sub: userId, jti }       • Payload: { sub: userId, jti }
• Se envía en header:                 • Se envía en body de
  Authorization: Bearer <token>         POST /api/auth/refresh
• Validado en cada petición           • Almacenado hasheado en BD
  (auth.middleware.ts)                  (refresh_tokens.token_hash)
• NO contiene rol                     • Se revoca al usarse (rotación)
```

**Flujo de refresh**:
1. Cliente envía refresh token → `POST /api/auth/refresh`
2. Servidor verifica firma JWT + busca hash en BD
3. Si es válido: revoca el token viejo, genera par nuevo, guarda hash del nuevo refresh
4. Si ya fue revocado: posible reuso de token → 401 (seguridad)

**Bloqueo de cuenta**: Tras 5 intentos fallidos de login, `locked_until` se fija a +15 minutos. El contador es atómico (SQL `CASE` en una sola sentencia) para evitar race conditions.

**Middleware admin** (`admin.middleware.ts`):
- Montado después de `authMiddleware` (que ya puso `req.userId`)
- **No confía en claims del JWT**: consulta `userRepo.findById(req.userId)` en cada petición
- Revocar rol admin surte efecto inmediato (sin esperar expiración del token)

### 5.6.2. Rate Limiting

| Ruta/Conjunto | Ventana | Límite | Librería |
|---|---|---|---|
| Global (todas las rutas) | 15 min | 100 | `express-rate-limit` |
| `/api/auth/*` | 15 min | 20 | `express-rate-limit` |
| `/api/auth/login` | 1 min | 5 | `express-rate-limit` |
| `/api/auth/refresh` | 1 min | 10 | `express-rate-limit` |
| `/api/diagnosis`, `/api/freeze-frame`, `/api/ecu-info`, etc. | 1 min | 20 | `express-rate-limit` |
| `/api/mcp/cognitive-diagnosis` | 1 min | 5 | `express-rate-limit` |
| `/api/clear-dtc` | 1 min | 5 | `express-rate-limit` |
| `/api/live-data` | 1 seg | 1 | `express-rate-limit` |
| `/api/admin/*` | 1 min | 30 | `express-rate-limit` |

**Nota**: En desarrollo (`NODE_ENV !== 'production'`), el rate limiter devuelve un middleware noop — para no interferir con pruebas manuales. Los headers estándar (`RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`) solo se emiten en producción.

### 5.6.3. Cabeceras de Seguridad (Helmet)

| Cabecera | Configuración |
|---|---|
| `Content-Security-Policy` | `default-src 'none'` (máxima restricción). Swagger UI relaja `script-src` y `style-src`. |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Frame-Options` | `deny` (frameguard) |
| `X-Content-Type-Options` | `nosniff` |
| `X-DNS-Prefetch-Control` | `off` |

### 5.6.4. CORS

- Allowlist configurable vía `ALLOWED_ORIGINS` (por defecto `http://localhost:5173,http://localhost:4173`)
- Métodos: `GET`, `POST`, `OPTIONS`
- Headers: `Content-Type`, `Authorization`
- `maxAge`: 600 segundos

### 5.6.5. Auditoría HTTP (OWASP A09)

- **Middleware**: `audit-logger.middleware.ts` se monta como middleware global
- **Datos registrados**: método, ruta, status code, IP, user-agent, duración (ms), userId
- **Exclusión**: rutas `/api/admin/*` no se auditan (evita ruido recursivo al consultar el propio panel)
- **Persistencia**: tabla `audit_logs`, escritura asíncrona en evento `finish` de la respuesta
- **Fallo silencioso**: si falla la escritura, se loguea a consola pero no interrumpe la respuesta

---

## 5.7. Panel de Administración

El backend expone 6 endpoints bajo `/api/admin/*` que alimentan el panel de administración de la UI.

### Funcionalidades expuestas:

1. **Overview** (`/api/admin/overview`)
   - Totales de usuarios por `userType` (individual/workshop) y `role` (user/admin)
   - Conteo de errores en las últimas 24h (desde tabla `logs`, nivel `error`)
   - Actividad HTTP por ruta (desde `audit_logs`, agrupado por `path`) — **aproximación**, no diagnósticos reales

2. **Logs del sistema** (`/api/admin/logs`)
   - Paginación (default 20 items, máx 100)
   - Filtros: `level` (debug/info/warn/error), `from`/`to` (fecha), `q` (búsqueda texto en mensaje)
   - Ordenados por fecha descendente

3. **Auditoría HTTP** (`/api/admin/audit-logs`)
   - Paginación (default 20 items, máx 100)
   - Filtros: `statusCode`, `path`, `userId`, `from`/`to`, `q`
   - Ordenados por fecha descendente

4. **Usuarios** (`/api/admin/users`)
   - Paginación (default 20 items, máx 100)
   - Filtros: `q` (búsqueda en email/username), `from`/`to`
   - **Nunca incluye `passwordHash`** (misma proyección `safeUser` que `/api/auth/me`)
   - Muestra `failedLoginAttempts` y `lockedUntil`

5. **Catálogo vectorial** (`/api/admin/knowledge`)
   - Conteo de entradas en cada índice: `pids`, `dtcs`, `diagnoses`
   - Muestra de hasta 5 entradas por índice (sin orden de relevancia)
   - Responde 503 si LanceDB no está disponible

6. **Búsqueda semántica** (`/api/admin/knowledge/search`)
   - Permite probar la búsqueda vectorial (embedding + `VectorStore.query()`)
   - El mismo pipeline que usa el RAG real durante el diagnóstico cognitivo
   - Parámetros: `text` (consulta), `index` (pids/dtcs/diagnoses), `limit` (1-20)

---

## 5.8. Arranque de la Aplicación

### 5.8.1. Desarrollo local

```bash
# 1. Crear .env desde la plantilla
cp .env.example .env
# Editar ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET, LLM_API_KEY...

# 2. Arrancar con script unificado (carga .env + libera puertos + dev:all)
./scripts/start-dev.sh

# Equivalentes manuales:
source .env
pnpm dev:all        # Arranca core-api (port 4000) + UI (port 5173)
# o solo el backend:
pnpm --filter core-api dev   # tsx watch src/main.ts
```

**Importante**: El API NO usa `dotenv`. Las variables de entorno deben estar en el entorno del proceso (`source .env` o `scripts/start-dev.sh`). Arrancar con `npx tsx src/main.ts` directamente sin cargar el `.env` fallará.

### 5.8.2. Producción con Docker Compose

```bash
# 1. Configurar secretos
export ACCESS_TOKEN_SECRET="<secreto-seguro>"
export REFRESH_TOKEN_SECRET="<secreto-seguro>"

# 2. Levantar servicios (3 emuladores ELM327 + API)
docker compose up -d

# Servicios:
#   elm327-audi    → puerto 35000 (Audi A3 2.0 TDI)
#   elm327-kawasaki → puerto 35001 (Kawasaki Z900)
#   elm327-toyota   → puerto 35002 (Toyota Auris Hybrid)
#   api            → puerto 4000  (core-api)
```

**Variables de entorno críticas en producción** (validadas por `assertProductionSecrets()`):

| Variable | Validación |
|---|---|
| `NODE_ENV` | Debe ser `production` |
| `ACCESS_TOKEN_SECRET` | No puede ser `dev-access-secret` ni `change-me-in-production` |
| `REFRESH_TOKEN_SECRET` | No puede ser `dev-refresh-secret` ni `change-me-in-production` |
| `OBD_MODE` | `docker` (emulador) o `tcp` (dispositivo real) |
| `ALLOWED_ORIGINS` | Orígenes separados por coma para CORS |

### 5.8.3. Configuración completa (`AppConfig`)

Validada con Zod en `infrastructure/configuration/index.ts`:

```typescript
{
  NODE_ENV: 'development' | 'production' | 'test'
  PORT: number                         // default 4000
  DB_PATH: string                      // default 'data/diagnostics.db'
  LANCEDB_PATH: string                 // default 'data/lancedb'
  OBD_MODE: 'docker' | 'tcp'          // default 'docker'
  ELM327_HOST: string                  // TCP: host del dispositivo real
  ELM327_PORT: number                  // TCP: puerto del dispositivo real
  ELM327_AUDI_HOST: string             // Docker: host emulador Audi
  ELM327_AUDI_PORT: number             // Docker: puerto emulador Audi
  ELM327_KAWASAKI_HOST: string         // Docker: host emulador Kawasaki
  ELM327_KAWASAKI_PORT: number         // Docker: puerto emulador Kawasaki
  ELM327_TOYOTA_HOST: string           // Docker: host emulador Toyota
  ELM327_TOYOTA_PORT: number           // Docker: puerto emulador Toyota
  ALLOWED_ORIGINS: string              // CORS origins (comma-separated)
  ACCESS_TOKEN_SECRET: string          // JWT signing secret (15min)
  REFRESH_TOKEN_SECRET: string         // JWT signing secret (7d)
  LLM_PROVIDER: 'anthropic' | 'openai' // optional
  ANTHROPIC_API_KEY: string            // optional
  LLM_API_KEY: string                  // optional (OpenAI/DeepSeek/Groq...)
  LLM_BASE_URL: string                 // optional (custom endpoint)
  LLM_MODEL: string                    // optional
  WEB_SEARCH_API_KEY: string           // optional (SerpAPI)
  ADMIN_EMAIL: string                  // optional (seed admin user)
  ADMIN_PASSWORD: string               // optional (seed admin user)
}
```

### 5.8.4. Comandos útiles

```bash
# Base de datos
pnpm --filter core-api db:generate     # Generar migraciones desde schema.ts
pnpm --filter core-api db:migrate      # Aplicar migraciones
pnpm --filter core-api db:push         # Sincronizar schema ↔ BD (sin migraciones)
pnpm --filter core-api db:studio       # Drizzle Studio (explorador visual)

# Tests
pnpm --filter core-api test            # Vitest run
pnpm --filter core-api test:coverage   # Con cobertura (Features ≥80%, Core 100%)

# Calidad
pnpm --filter core-api lint            # ESLint
pnpm --filter core-api format          # Prettier check
```

---

## 5.9. Observabilidad

### Logging estructurado (Pino + SQLite)

- **Pino** como motor de logging (JSON estructurado, alto rendimiento)
- **pino-pretty** en desarrollo (salida coloreada y legible)
- **Persistencia dual**: cada entrada de log se escribe en la tabla `logs` de SQLite
- Niveles: `debug`, `info`, `warn`, `error`
- El `LoggerPort` (`application/ports/LoggerPort.ts`) abstrae el motor — los casos de uso dependen de la interfaz, no de Pino
- **`createdAt` se fija explícitamente** en el logger (NO se confía en el `default` de Drizzle) porque el `default` de schema.ts usa la cadena literal `"datetime('now')"` en lugar de una expresión SQL

### Health check

`GET /health` → `{ status: "ok", uptime: <segundos> }`

---

## 5.10. Discrepancias Detectadas

Comparando el código real (rama `develop`, 2026-08-09) con los ADR, OpenSpec specs y documentación:

### 5.10.1. ADR 001 — Arquitectura del Sistema

| Aspecto | ADR 001 dice... | Código real... | Gravedad |
|---|---|---|---|
| **Nombre de ficheros de entidad** | `User.ts`, `DiagnosisSession.ts`, `VehicleProfile.ts` (PascalCase) | `user.ts`, `diagnosisSession.ts`, `vehicleProfile.ts` (camelCase) | Baja — naming consistente con el resto del proyecto |
| **Puertos en `application/ports/`** | Menciona `UserRepository`, `ObdRepository`, `LlmClientPort`, `LoggerPort` | Correcto. Coinciden los nombres y la ubicación | — |
| **MCP Server como adaptador** | "MCP Server es un adaptador de infraestructura — expone tools al LLM pero no contiene logica de negocio" | Correcto. `mcp/mcpServer.ts` está en infrastructure | — |
| **Composition root en `composition.ts`** | Correcto | Correcto | — |
| **Logging con pino** | Correcto | Correcto (`infrastructure/observability/logger.ts` usa pino) | — |
| **432 tests (33 ficheros)** | Mencionado en consecuencias positivas | No verificado en este análisis, pero plausible | — |

### 5.10.2. ADR 002 — Persistencia de Datos (DISCREPANCIAS MAYORES)

El ADR 002 está **significativamente desactualizado** respecto al código real:

| Aspecto | ADR 002 dice... | Código real... | Gravedad |
|---|---|---|---|
| **Motor de BD en producción** | PostgreSQL 17 con driver `pg` | **Solo SQLite**. No existe `pg` en `package.json`. Decisión posterior (Engram): "SQLite sufficient for VPS, no PostgreSQL migration needed" | **Alta** — la BD de producción es SQLite, no PostgreSQL |
| **Ubicación de repositorios (interfaces)** | `domain/repositories/` (ej. `IVehicleRepository`, `IDiagnosticSessionRepository`) | `application/ports/` (ej. `VehicleRepository`, sin prefijo `I`) | **Alta** — las interfaces están en capa de aplicación, no en dominio |
| **Tabla `workspaces`** | "Talleres registrados (nombre, slug, activo/inactivo)" | **No existe**. El concepto de taller se maneja como `userType: 'workshop'` en la tabla `users` | **Alta** — tabla inexistente |
| **Tabla `diagnostic_results`** | "Resultados del parseo + IA (DTCs, parsed_values JSON, diagnosis_text, severidad)" | **No existe**. Los resultados de diagnóstico se devuelven en la respuesta HTTP pero no se persisten | **Alta** — tabla inexistente |
| **Tabla `simulation_scenarios`** | "Catálogo de escenarios predefinidos (config PID + DTC en JSON)" | **No existe**. Los escenarios se definen en `composition.ts` como objetos `ScenarioDescriptor` y se conectan a emuladores TCP | **Alta** — tabla inexistente |
| **Tabla `activity_logs`** | "Trazabilidad de actividad por taller (acción, metadata JSON, timestamp)" | **No existe**. La trazabilidad se cubre con `audit_logs` (HTTP) + `logs` (aplicación) | **Media** — reemplazada por dos tablas diferentes |
| **Total de tablas** | 7 tablas | 10 tablas: `vehicles`, `ecus`, `pid_definitions`, `pid_readings`, `diagnosis_sessions`, `users`, `refresh_tokens`, `audit_logs`, `logs` | **Alta** — faltan 3, sobran 6 |
| **Tablas extra en código real** | No documentadas | `ecus`, `pid_definitions`, `pid_readings`, `refresh_tokens`, `audit_logs`, `logs` — todas implementadas y funcionales | **Alta** — el catálogo de PIDs, ECUs y sistema de auditoría no están documentados |

### 5.10.3. OpenSpec Specs vs Código Real

| Spec | Discrepancia |
|---|---|
| **rate-limiting** | Spec dice "100 por ventana de 15 minutos" (global). El código coincide, pero además implementa límites específicos por ruta (no documentados en el spec): auth 20/15min, login 5/1min, diagnosis 20/1min, cognitivo 5/1min, etc. El spec no menciona que en desarrollo el rate limiter está desactivado. |
| **auth-endpoints** | Spec menciona escenario "Username duplicado" con 409 `Username already taken`. El código real solo valida email duplicado — no tiene validación explícita de username duplicado en el caso de uso (la constraint UNIQUE de BD lanzaría error 500 genérico). |

### 5.10.4. Stack real vs documentado

| Aspecto | Documentación/ADR | Código real |
|---|---|---|
| **Framework HTTP** | ADR 001 menciona "Express" correctamente. Swagger spec menciona servidor `localhost:4000`. | Express 5.1.0. **No es Fastify**. |
| **TypeScript ORM** | Drizzle ORM (correcto) | Drizzle 0.45.2 (correcto) |
| **BD vectorial** | No mencionada en ADRs (es posterior). Sí en OpenSpec spec `lancedb-infra`. | LanceDB 0.31.0, embebida en el proceso Node |
| **Embeddings** | No documentado en ADRs | @xenova/transformers (local, sin API externa) |
| **Web search** | No documentado en ADRs | SerpAPI (custom client en `infrastructure/web-search/`) |

---

## 5.11. Rutas Investigadas

Para este análisis se inspeccionaron los siguientes ficheros del código real:

```
apps/core-api/
├── package.json
├── src/
│   ├── main.ts
│   ├── domain/
│   │   ├── entities/          (user.ts, vehicleProfile.ts, diagnosisSession.ts,
│   │   │                        ecuInfo.ts, pidDefinition.ts, pidReading.ts)
│   │   ├── value-objects/     (email.ts, vin.ts, pidCode.ts, formula.ts,
│   │   │                        dtcCode.ts, liveData.ts, diagnosisResult.ts,
│   │   │                        vehicleInfo.ts, vehicleStatus.ts, freezeFrame.ts,
│   │   │                        knowledgeSource.ts)
│   │   ├── pids.ts
│   │   ├── dtcCatalog.ts
│   │   └── pidObservationCatalog.ts
│   ├── application/
│   │   ├── ports/             (19 interfaces)
│   │   ├── use-cases/         (RegisterUser, LoginUser, RefreshToken,
│   │   │                        GetCurrentUser, LogoutUser,
│   │   │                        ProcessVehicleDiagnosis,
│   │   │                        ExecuteCognitiveDiagnosis, ExecuteLlmToolCalling,
│   │   │                        ValidateDiscoveredPid, ValidateDiscoveredDtc,
│   │   │                        admin/* (5 use cases))
│   │   └── dto/               (auth/, admin/, diagnosis/, audit/, llm/,
│   │                            knowledge/, vector/, web-search/)
│   └── infrastructure/
│       ├── composition/composition.ts
│       ├── configuration/index.ts
│       ├── http/
│       │   ├── server.ts
│       │   ├── swagger.ts
│       │   ├── controllers/   (AuthController, DiagnosisController, AdminController)
│       │   ├── routes/        (auth.routes, diagnosis.routes, admin.routes)
│       │   └── middleware/    (auth, admin, rate-limiter, audit-logger)
│       ├── persistence/
│       │   ├── sqlite/
│       │   │   ├── schema.ts (10 tablas)
│       │   │   ├── db.ts
│       │   │   ├── userRepository.ts
│       │   │   ├── vehicleRepository.ts
│       │   │   ├── auditLogRepository.ts
│       │   │   ├── logRepository.ts
│       │   │   └── refreshTokenStore.ts
│       │   └── mappers/       (userMapper, auditLogMapper, refreshTokenMapper)
│       ├── services/
│       │   ├── authService.ts
│       │   └── diagnosisService.ts
│       ├── observability/logger.ts
│       ├── mcp/mcpServer.ts
│       └── llm/               (anthropicClient, openAiClient)
├── docs/
│   ├── adr/001-arquitectura-del-sistema.md
│   └── adr/002-persistencia-de-datos.md
├── .env.example
├── docker-compose.yml
└── scripts/start-dev.sh
```

---

> **Nota para el tribunal**: Este documento refleja el estado real del código en la rama `develop` a fecha 2026-08-09. Las discrepancias con los ADR se deben a la evolución natural del proyecto (los ADR no se actualizaron tras decisiones posteriores como "solo SQLite" o la incorporación de tablas de PIDs y ECUs). El documento `ADR-002-persistencia-de-datos.md` requiere una actualización para reflejar el esquema real de 10 tablas.
