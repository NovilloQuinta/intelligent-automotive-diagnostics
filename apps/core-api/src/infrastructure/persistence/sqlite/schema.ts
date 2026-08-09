import { sqliteTable, integer, real, text, unique, index } from 'drizzle-orm/sqlite-core'

/** Tabla de vehiculos detectados por VIN (ISO 3779). */
export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vin: text('vin').notNull().unique(),
  make: text('make').notNull(),
  model: text('model').notNull(),
  year: integer('year').notNull(),
  engineType: text('engine_type').notNull(),
  firstSeen: text('first_seen').notNull().default("datetime('now')"),
  lastSeen: text('last_seen').notNull().default("datetime('now')"),
})

/** ECUs descubiertas en el bus CAN del vehiculo. */
export const ecus = sqliteTable('ecus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id')
    .notNull()
    .references(() => vehicles.id),
  name: text('name').notNull(),
  requestAddr: text('request_addr').notNull(),
  responseAddr: text('response_addr').notNull(),
  type: text('type').notNull(),
  protocol: text('protocol').notNull().default('CAN_11_500'),
  discoveredAt: text('discovered_at').notNull().default("datetime('now')"),
})

/** Catalogo auto-expansivo de definiciones de PID (SAE J1979 + propietarios). */
export const pidDefinitions = sqliteTable('pid_definitions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id').references(() => vehicles.id),
  ecuId: integer('ecu_id').references(() => ecus.id),
  mode: text('mode').notNull(),
  pidCode: text('pid_code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  formula: text('formula').notNull(),
  unit: text('unit'),
  dataBytes: integer('data_bytes').notNull().default(1),
  pidType: text('pid_type').notNull().default('formula'),
  minValue: real('min_value'),
  maxValue: real('max_value'),
  manufacturer: text('manufacturer'),
  model: text('model'),
  confidence: real('confidence').notNull().default(1.0),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
})

/** Lecturas historicas de PIDs con valor parseado y raw hex. */
export const pidReadings = sqliteTable('pid_readings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pidDefId: integer('pid_def_id').references(() => pidDefinitions.id),
  sessionId: text('session_id').notNull(),
  rawHex: text('raw_hex').notNull(),
  parsedValue: real('parsed_value'),
  timestamp: text('timestamp').notNull().default("datetime('now')"),
})

/** Sesiones de diagnostico vinculadas a un vehiculo y escenario.
 *  El resultado se guarda como snapshot immutable (JSON) para preservar
 *  el informe tal como se genero, independientemente de cambios futuros
 *  en catalogos, formulas o prompts del LLM.
 */
export const diagnosisSessions = sqliteTable(
  'diagnosis_sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    vehicleId: integer('vehicle_id').references(() => vehicles.id),
    userId: integer('user_id').references(() => users.id),
    scenarioId: text('scenario_id'),
    startedAt: text('started_at').notNull().default("datetime('now')"),
    endedAt: text('ended_at'),
    resultJson: text('result_json'),
    severity: text('severity'),
    dtcCount: integer('dtc_count'),
  },
  (table) => ({
    userIdStartedAtIdx: index('idx_diagnosis_sessions_user_started').on(
      table.userId,
      table.startedAt,
    ),
  }),
)

/** Usuarios de la aplicacion (particulares y talleres). */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  userType: text('user_type').notNull(), // 'individual' | 'workshop'
  role: text('role').notNull().default('user'), // 'user' | 'admin'
  businessName: text('business_name'),
  taxId: text('tax_id'),
  address: text('address'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: text('locked_until'),
})

/** Refresh tokens para renovar access tokens sin reautenticacion. */
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default("datetime('now')"),
  revokedAt: text('revoked_at'),
})

/** Registro de auditoria de peticiones HTTP para trazabilidad (OWASP A09). */
export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  method: text('method').notNull(),
  path: text('path').notNull(),
  statusCode: integer('status_code').notNull(),
  ip: text('ip'),
  userAgent: text('user_agent'),
  durationMs: integer('duration_ms'),
  userId: integer('user_id'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
})

/** Logs de aplicacion para trazabilidad de errores y eventos. */
export const logs = sqliteTable('logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level').notNull(),
  message: text('message').notNull(),
  context: text('context'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
})

/** Catalogo auto-expansivo de definiciones de DTC por fabricante y modelo. */
export const dtcDefinitions = sqliteTable(
  'dtc_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    manufacturer: text('manufacturer').notNull(),
    model: text('model').notNull(),
    code: text('code').notNull(),
    description: text('description'),
    confidence: real('confidence').notNull().default(0.5),
    source: text('source').notNull().default('web'),
    createdAt: text('created_at').notNull().default("datetime('now')"),
  },
  (table) => ({
    unq: unique('dtc_manufacturer_model_code').on(table.manufacturer, table.model, table.code),
  }),
)
