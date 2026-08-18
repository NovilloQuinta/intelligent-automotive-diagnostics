# ADR 002: Persistencia de Datos

**Estado:** Implementado (revisado Fase 4)
**Fecha:** 2026-07-06 | **Revisado:** 2026-08-18
**Contexto:** Necesidad de persistir vehículos, ECUs, catálogos de diagnóstico, sesiones y trazabilidad

---

## Contexto

El proyecto inicial contemplaba solo un flujo en memoria (simulador → parseo → diagnóstico). Para
que la aplicación tenga utilidad real es necesario persistir:

- **Usuarios:** autenticación, tipo de cuenta (particular / taller) y rol
- **Vehículos:** identificación por VIN y ECUs descubiertas en el bus
- **Catálogos auto-expansivos:** definiciones de PID, DTC, ECU e identidades WMI que crecen con el uso
- **Sesiones de diagnóstico:** cada ejecución, con su informe como snapshot inmutable
- **Trazabilidad:** logs de aplicación y auditoría de peticiones HTTP (OWASP A09)

## Decisión

Capa de persistencia en `src/infrastructure/persistence/sqlite/` con **Drizzle ORM sobre SQLite**
(`better-sqlite3`), motor único en todos los entornos.

### ORM: Drizzle ORM

- Type-safe nativo (los schemas son TypeScript, no archivos `.prisma`)
- Ligero, sin clase "base" ni runtime pesado
- `drizzle-kit` para generar migraciones y explorar con Drizzle Studio

### Motor de BD: SQLite único

`getDb()` (`persistence/sqlite/db.ts`) abre una instancia singleton, aplica
`journal_mode = WAL` y `foreign_keys = ON`, y **ejecuta las migraciones pendientes** desde
`drizzle/` en la primera llamada. Sin ruta se abre `:memory:`, que es lo que usan los tests.

### Modelo de datos (13 tablas)

```
users ──┬── refresh_tokens
        ├── password_reset_tokens
        └── diagnosis_sessions ── pid_readings ── pid_definitions
vehicles ──┬── ecus
           └── diagnosis_sessions

Catálogos auto-expansivos (sin FK, clave natural):
  pid_definitions · dtc_definitions · ecu_definitions · vehicle_identities

Trazabilidad: audit_logs · logs
```

| Tabla | Propósito |
|---|---|
| **users** | Cuentas (`user_type`: individual/workshop, `role`: user/admin), datos fiscales opcionales, contador de intentos fallidos y `locked_until` para el bloqueo por fuerza bruta |
| **refresh_tokens** | Tokens de refresco hasheados, con `expires_at` y `revoked_at` para la rotación |
| **password_reset_tokens** | Tokens de reseteo de un solo uso, hasheados SHA-256, con TTL y `used_at` |
| **vehicles** | Vehículos detectados por VIN (ISO 3779): marca, modelo, año, motor, `first_seen`/`last_seen` |
| **ecus** | ECUs descubiertas en el bus CAN de un vehículo (direcciones request/response, tipo, protocolo) |
| **pid_definitions** | Catálogo auto-expansivo de PIDs (SAE J1979 + propietarios) con fórmula, unidad, `confidence` y `source`. Índice único (modo, pid, fabricante, modelo) como backstop de idempotencia |
| **pid_readings** | Lecturas históricas de PID con hex crudo y valor parseado, indexadas por sesión |
| **diagnosis_sessions** | Sesión de diagnóstico con `result_json` como **snapshot inmutable** del informe, más `severity` y `dtc_count` desnormalizados para el listado |
| **dtc_definitions** | Catálogo auto-expansivo de DTCs por fabricante y modelo |
| **ecu_definitions** | Catálogo auto-expansivo de ECUs por fabricante, modelo y dirección de respuesta |
| **vehicle_identities** | WMI (3 primeros caracteres del VIN) → fabricante. Sembrado con la asignación oficial ISO 3779 y ampliado por la cascada de identificación |
| **audit_logs** | Auditoría de peticiones HTTP: método, ruta, código, IP, user-agent, duración y usuario |
| **logs** | Logs de aplicación persistidos (nivel, mensaje, contexto) |

El `result_json` de `diagnosis_sessions` es deliberadamente un snapshot: preserva el informe tal y
como se generó, aunque después cambien los catálogos, las fórmulas o el prompt del LLM.

### Impacto en Clean Architecture

- Los **puertos de repositorio** viven en el dominio; las **implementaciones** Drizzle en
  `infrastructure/persistence/sqlite/`, con mappers dedicados en `persistence/mappers/`
- `DiagnosticsDb` (alias de `BetterSQLite3Database`) queda declarado en `db.ts` como el único punto
  de acoplamiento al motor: es el límite de capa que habría que tocar al cambiar de SQL

## Revisión de Fase 4: por qué no hay PostgreSQL

La versión original de este ADR proponía **motor dual**: SQLite en desarrollo y PostgreSQL 17 en
producción, seleccionados por `DATABASE_URL`. No se implementó, y se descarta conscientemente:

- El despliegue real es **single-container** para un TFM con un puñado de usuarios concurrentes.
  SQLite en modo WAL admite lectores concurrentes con un escritor, que es exactamente el perfil de
  carga de la aplicación. PostgreSQL habría añadido un servicio, una red y un backup que gestionar
  sin resolver ningún problema observado.
- Mantener dos dialectos vivos obliga a probar contra ambos. Las diferencias sutiles en JSON y
  funciones de fecha que el propio ADR anticipaba como riesgo se convierten en coste real de tests
  a cambio de una portabilidad que nadie iba a ejercer.
- La portabilidad no se pierde, se aplaza: los repositorios están detrás de puertos y las queries
  son Drizzle, así que migrar significa cambiar `DiagnosticsDb` y el driver, no reescribir la capa
  de aplicación.

En consecuencia **no existen** el driver `pg` ni la variable `DATABASE_URL` en el código. El modelo
de datos tampoco es el propuesto originalmente: la orientación multi-taller (`workspaces`,
`activity_logs`, `simulation_scenarios`, `diagnostic_results`) se sustituyó por un modelo centrado
en el vehículo y en catálogos que aprenden, que es la tesis del proyecto. Los escenarios de
simulación no son una tabla: viven en el emulador (ver ADR 004).

## Consecuencias

**Positivas:**

- Trazabilidad completa: cada diagnóstico queda registrado con su informe congelado
- Histórico por vehículo y por usuario, con índice `(user_id, started_at)` para el listado paginado
- Los catálogos auto-expansivos convierten cada diagnóstico en conocimiento reutilizable (ADR 007)
- Zero configuración: sin servidor de BD, y las migraciones se aplican solas al arrancar
- Los tests corren contra `:memory:` con el schema real, no contra mocks del ORM

**Negativas:**

- Un solo escritor: no escala horizontalmente sin migrar de motor
- Sin cifrado at-rest (riesgo residual asumido y documentado en `docs/security.md`)
- El fichero `.db` es estado con nombre en el contenedor: requiere volumen persistente en el deploy

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **PostgreSQL en producción** | Ver "Revisión de Fase 4": coste operativo sin problema que resolver a esta escala |
| **Prisma ORM** | Cliente pesado; schema en `.prisma` (no TypeScript); peor soporte multi-dialecto |
| **TypeORM** | Decorators y `reflect-metadata` en runtime; más verboso |
| **pg raw (sin ORM)** | Mucho código manual para queries, migraciones y validación; sin type-safety |
| **MongoDB** | Los datos son relacionales (vehículo → ECUs → sesiones → lecturas); no encaja con document store |

## Dependencias

```
drizzle-orm            # ORM
drizzle-kit            # Migraciones + Studio (dev)
better-sqlite3         # Driver SQLite
@types/better-sqlite3  # (dev)
```

## Referencias

- Drizzle ORM: https://orm.drizzle.team
- ADR 001: `001-arquitectura-del-sistema.md` (arquitectura base)
- ADR 007: `007-catalogo-auto-expansivo-lancedb.md` (catálogos y búsqueda vectorial)
- `docs/security.md` (riesgos residuales de persistencia)
