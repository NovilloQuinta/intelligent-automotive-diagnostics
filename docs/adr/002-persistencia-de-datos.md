# ADR 002: Persistencia de Datos

**Estado:** Propuesto
**Fecha:** 2026-07-06
**Contexto:** Necesidad de almacenar información de talleres, vehículos y diagnósticos

---

## Contexto

El proyecto inicial contemplaba solo un flujo en memoria (simulador → parseo → diagnóstico), pero para que la aplicación tenga utilidad real como plataforma es necesario persistir:

- **Talleres (workspaces):** registro de talleres que usan la plataforma
- **Usuarios:** autenticación y roles dentro de cada taller
- **Vehículos:** historial de VINs diagnosticados por taller
- **Sesiones de diagnóstico:** cada vez que se ejecuta un diagnóstico
- **Resultados:** DTCs, valores parseados y diagnóstico generado por IA
- **Escenarios de simulación:** catálogo de perfiles de vehículo para demo
- **Logs de actividad:** trazabilidad de acciones por taller (monitorización)

## Decisión

Se incorpora una capa de persistencia en `src/infrastructure/persistence/sqlite/` con las siguientes elecciones tecnicas:

### ORM: Drizzle ORM

- Type-safe nativo (los schemas son TypeScript, no archivos .prisma)
- Soporta múltiples dialectos (PostgreSQL + SQLite con el mismo schema)
- Ligero, sin clase "base" ni runtime pesado
- `drizzle-kit` para generar migrations y explorar con Drizzle Studio

### Motor de BD: Dual

| Entorno | Motor | Razón |
|---|---|---|
| **Desarrollo local** | SQLite (`better-sqlite3`) | Zero setup, sin servidor, archivo local. Rápido para iterar |
| **Producción** | PostgreSQL 17 | Escalable, concurrencia real, tipado fuerte, funciones avanzadas |

La conexión se determina por variable de entorno: si `DATABASE_URL` apunta a PostgreSQL se usa ese driver; si no, SQLite por defecto.

### Modelo de datos (7 tablas)

```
workspaces ──┬── users
             ├── vehicles ──┬── diagnostic_sessions ──┬── diagnostic_results
             │               └── simulation_scenarios ┘
             └── activity_logs
```

| Tabla | Propósito |
|---|---|
| **workspaces** | Talleres registrados (nombre, slug, activo/inactivo) |
| **users** | Usuarios del sistema (name, email, password_hash, rol) |
| **vehicles** | Vehículos diagnosticados (VIN, marca, modelo, año, motor) |
| **diagnostic_sessions** | Sesión de diagnóstico (timestamps, estado, escenario usado) |
| **diagnostic_results** | Resultados del parseo + IA (DTCs, parsed_values JSON, diagnosis_text, severidad) |
| **simulation_scenarios** | Catálogo de escenarios predefinidos (config PID + DTC en JSON) |
| **activity_logs** | Trazabilidad de actividad por taller (acción, metadata JSON, timestamp) |

### Impacto en Clean Architecture

- Se añaden **interfaces de repositorio** en `domain/repositories/` (ej. `IWorkspaceRepository`, `IVehicleRepository`, `IDiagnosticSessionRepository`, `IActivityLogRepository`)
- Las **implementaciones concretas** (Drizzle + SQLite/PostgreSQL) viven en `infrastructure/persistence/sqlite/`
- Los **casos de uso** existentes (`processVehicleDiagnosis`, `executeCognitiveDiagnosis`) reciben estos repositorios por inyección para guardar resultados

## Consecuencias

**Positivas:**

- Trazabilidad completa: cada diagnóstico queda registrado con su resultado
- Histórico por vehículo: un taller puede ver diagnósticos anteriores del mismo VIN
- Logs de actividad permiten monitorizar el uso de la plataforma
- SQLite en desarrollo = zero configuración para empezar a codificar
- Drizzle permite cambiar a PostgreSQL sin reescribir queries

**Negativas:**

- Complejidad añadida al proyecto (dependencias nuevas, migrations)
- Los tests unitarios de usecases requieren mockear repositorios DB
- SQLite y PostgreSQL tienen diferencias sutiles (JSON, funciones de fecha)
- La capa de persistencia no se demuestra en la defensa (se queda en segundo plano)

## Alternativas consideradas

| Alternativa | Razón para descartar |
|---|---|
| **Prisma ORM** | Genera cliente pesado; schema en .prisma (no TypeScript); peor soporte multi-dialecto SQLite/PG |
| **TypeORM** | Decorators, runtime reflect-metadata; más verbose; equipo prefiere schema-first |
| **pg raw (sin ORM)** | Mucho código manual para queries, migraciones y validación; sin type-safety |
| **MongoDB** | Datos relacionales (talleres → vehículos → sesiones); no encaja bien con document store |
| **SQLite en todos los entornos** | No escala a producción; sin concurrencia real |

## Dependencias nuevas

```
drizzle-orm        # ORM
drizzle-kit        # Migraciones + Studio (dev)
better-sqlite3     # Driver SQLite
@types/better-sqlite3  # (dev)
pg                 # Driver PostgreSQL
@types/pg          # (dev)
```

## Referencias

- Drizzle ORM: https://orm.drizzle.team
- ADR 001: `001-arquitectura-del-sistema.md` (arquitectura base del proyecto)
