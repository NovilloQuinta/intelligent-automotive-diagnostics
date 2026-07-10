# Schema Proposal — Drizzle ORM

> Propuesta de schemas para la capa de persistencia.
> Fichero de referencia, no implementado aún.
> Fecha: 2026-07-06

---

## Convenciones

- `id`: autoincrement integer (SQLite compatible)
- `created_at` / `updated_at`: timestamps con defaults
- `metadata` fields: tipo `text` con JSON string (portable entre SQLite y PostgreSQL)
- Foreign keys con `notNull` donde la relación sea obligatoria

---

## 1. workspaces

```ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable('workspaces', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  address: text('address'),
  phone: text('phone'),
  email: text('email'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
  updatedAt: text('updated_at').notNull().default('(datetime(\'now\'))'),
})
```

## 2. users

```ts
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role', { enum: ['admin', 'mechanic'] }).notNull().default('mechanic'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
})
```

## 3. vehicles

```ts
export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'cascade' }),
  vin: text('vin'),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year'),
  engineType: text('engine_type'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
})
```

## 4. simulation_scenarios

```ts
export const simulationScenarios = sqliteTable('simulation_scenarios', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  vehicleType: text('vehicle_type', { enum: ['car', 'motorcycle'] }).notNull(),
  pidConfig: text('pid_config').notNull(),       // JSON: PID values for this scenario
  dtcConfig: text('dtc_config').notNull(),        // JSON: DTC codes active
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
})
```

## 5. diagnostic_sessions

```ts
export const diagnosticSessions = sqliteTable('diagnostic_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id),
  vehicleId: integer('vehicle_id').references(() => vehicles.id),
  scenarioId: integer('scenario_id').references(() => simulationScenarios.id),
  status: text('status', { enum: ['in_progress', 'completed', 'failed'] }).notNull().default('in_progress'),
  startedAt: text('started_at').notNull().default('(datetime(\'now\'))'),
  endedAt: text('ended_at'),
})
```

## 6. diagnostic_results

```ts
export const diagnosticResults = sqliteTable('diagnostic_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => diagnosticSessions.id, { onDelete: 'cascade' }),
  rawHex: text('raw_hex'),                         // Trama original recibida
  parsedValues: text('parsed_values'),             // JSON: valores físicos parseados
  dtcCodes: text('dtc_codes'),                     // JSON: códigos de error detectados
  diagnosisText: text('diagnosis_text'),            // Texto generado por la IA
  severity: text('severity', { enum: ['low', 'medium', 'high', 'critical'] }),
  aiMetadata: text('ai_metadata'),                 // JSON: modelo usado, tokens, latencia
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
})
```

## 7. activity_logs

```ts
export const activityLogs = sqliteTable('activity_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').notNull().references(() => workspaces.id),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),                // ej: 'diagnosis.run', 'scenario.switch', 'user.login'
  metadata: text('metadata'),                      // JSON: detalles contextuales
  ipAddress: text('ip_address'),
  createdAt: text('created_at').notNull().default('(datetime(\'now\'))'),
})
```

---

## Relaciones (Drizzle)

```ts
import { relations } from 'drizzle-orm'

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  users: many(users),
  vehicles: many(vehicles),
  diagnosticSessions: many(diagnosticSessions),
  activityLogs: many(activityLogs),
}))

export const usersRelations = relations(users, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [users.workspaceId], references: [workspaces.id] }),
  activityLogs: many(activityLogs),
}))

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  workspace: one(workspaces, { fields: [vehicles.workspaceId], references: [workspaces.id] }),
  diagnosticSessions: many(diagnosticSessions),
}))

export const diagnosticSessionsRelations = relations(diagnosticSessions, ({ one }) => ({
  workspace: one(workspaces, { fields: [diagnosticSessions.workspaceId], references: [workspaces.id] }),
  vehicle: one(vehicles, { fields: [diagnosticSessions.vehicleId], references: [vehicles.id] }),
  scenario: one(simulationScenarios, { fields: [diagnosticSessions.scenarioId], references: [simulationScenarios.id] }),
  result: one(diagnosticResults, { fields: [diagnosticSessions.id], references: [diagnosticResults.sessionId] }),
}))

export const diagnosticResultsRelations = relations(diagnosticResults, ({ one }) => ({
  session: one(diagnosticSessions, { fields: [diagnosticResults.sessionId], references: [diagnosticSessions.id] }),
}))

export const activityLogsRelations = relations(activityLogs, ({ one }) => ({
  workspace: one(workspaces, { fields: [activityLogs.workspaceId], references: [workspaces.id] }),
  user: one(users, { fields: [activityLogs.userId], references: [users.id] }),
}))
```

---

## Seeds: escenarios por defecto

```ts
export const defaultScenarios = [
  {
    name: 'Audi A3 — Funcionamiento normal',
    slug: 'audi-a3-normal',
    description: 'Audi A3 2.0 TDI en perfecto estado. Sin DTCs.',
    vehicleType: 'car',
    pidConfig: JSON.stringify({ rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 }),
    dtcConfig: JSON.stringify([]),
    isDefault: true,
  },
  {
    name: 'Audi A3 — Fallo de refrigeración',
    slug: 'audi-a3-overheat',
    description: 'Sensor de temperatura defectuoso, refrigerante bajo. DTC P0118.',
    vehicleType: 'car',
    pidConfig: JSON.stringify({ rpm: 1200, coolantTemp: 118, speed: 40, intakeTemp: 95 }),
    dtcConfig: JSON.stringify([{ code: 'P0118', description: 'Engine Coolant Temp Circuit High Input' }]),
    isDefault: false,
  },
  {
    name: 'Kawasaki Ninja — ABS error',
    slug: 'kawasaki-abs-fault',
    description: 'Módulo ABS con lectura errónea del sensor de rueda delantera.',
    vehicleType: 'motorcycle',
    pidConfig: JSON.stringify({ rpm: 3000, coolantTemp: 85, speed: 60, absStatus: 'fault' }),
    dtcConfig: JSON.stringify([{ code: 'C0045', description: 'ABS Wheel Speed Sensor LF Circuit Failure' }]),
    isDefault: false,
  },
]
```
