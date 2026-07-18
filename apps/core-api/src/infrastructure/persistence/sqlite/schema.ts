import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core'

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

export const ecus = sqliteTable('ecus', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id),
  name: text('name').notNull(),
  requestAddr: text('request_addr').notNull(),
  responseAddr: text('response_addr').notNull(),
  type: text('type').notNull(),
  protocol: text('protocol').notNull().default('CAN_11_500'),
  discoveredAt: text('discovered_at').notNull().default("datetime('now')"),
})

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
  minValue: real('min_value'),
  maxValue: real('max_value'),
  confidence: real('confidence').notNull().default(1.0),
  source: text('source').notNull().default('manual'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
})

export const pidReadings = sqliteTable('pid_readings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pidDefId: integer('pid_def_id').references(() => pidDefinitions.id),
  sessionId: text('session_id').notNull(),
  rawHex: text('raw_hex').notNull(),
  parsedValue: real('parsed_value'),
  timestamp: text('timestamp').notNull().default("datetime('now')"),
})

export const diagnosisSessions = sqliteTable('diagnosis_sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  vehicleId: integer('vehicle_id').notNull().references(() => vehicles.id),
  scenarioId: text('scenario_id'),
  startedAt: text('started_at').notNull().default("datetime('now')"),
  endedAt: text('ended_at'),
})
