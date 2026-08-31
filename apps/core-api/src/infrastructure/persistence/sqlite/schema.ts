import {
  sqliteTable,
  integer,
  primaryKey,
  real,
  text,
  unique,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core'

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
export const pidDefinitions = sqliteTable(
  'pid_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
    system: text('system'),
    confidence: real('confidence').notNull().default(1.0),
    source: text('source').notNull().default('manual'),
    createdAt: text('created_at').notNull().default("datetime('now')"),
  },
  (table) => ({
    // Backstop de idempotencia: una misma definición (modo + pid + fabricante + modelo)
    // solo puede existir una vez. `insertPidDefinition` normaliza manufacturer/model
    // de NULL a '' para que SQLite deduplique también las filas globales.
    modePidManufacturerModelUnique: uniqueIndex(
      'pid_definitions_mode_pid_manufacturer_model_unique',
    ).on(table.mode, table.pidCode, table.manufacturer, table.model),
  }),
)

/** Lecturas historicas de PIDs con valor parseado y raw hex. */
export const pidReadings = sqliteTable(
  'pid_readings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => diagnosisSessions.id),
    mode: text('mode').notNull(),
    pidCode: text('pid_code').notNull(),
    pidDefId: integer('pid_def_id').references(() => pidDefinitions.id),
    rawHex: text('raw_hex').notNull(),
    parsedValue: real('parsed_value'),
    timestamp: text('timestamp').notNull().default("datetime('now')"),
  },
  (table) => ({
    sessionIdIdx: index('idx_pid_readings_session_id').on(table.sessionId),
  }),
)

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
  /**
   * Secreto TOTP **cifrado** (AES-256-GCM). Nunca en claro: no es un hash como
   * `password_hash` —que es inutil para entrar—, sino la llave que genera los
   * codigos. La clave de descifrado vive en el entorno, no aqui.
   */
  twoFactorSecret: text('two_factor_secret'),
  /**
   * Separado del secreto a proposito: el alta guarda el secreto con el flag aun
   * a 0 y solo lo enciende cuando el usuario demuestra que su app genera codigos
   * validos. Sin esa separacion, un QR mal escaneado deja la cuenta inaccesible.
   */
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
})

/**
 * Retos de segundo factor: el paso intermedio entre "la contrasena es correcta" y
 * "aqui tienes los tokens".
 *
 * Es un token opaco hasheado, no un JWT, por dos motivos. Uno de correccion:
 * `verifyAccessToken` valida el payload con un schema Zod que descarta las claves
 * que no declara, asi que un JWT de reto firmado con el secreto de acceso pasaria
 * por access token y el segundo factor no existiria. Otro operativo: esto se puede
 * revocar, y un JWT de cinco minutos vive cinco minutos pase lo que pase.
 */
export const twoFactorChallenges = sqliteTable('two_factor_challenges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default("datetime('now')"),
  usedAt: text('used_at'),
})

/**
 * Codigos de recuperacion del segundo factor: un solo uso, guardados hasheados.
 *
 * SHA-256 y no bcrypt porque son valores aleatorios de alta entropia, no
 * contrasenas elegidas por personas: no hay diccionario que estirar, y meter el
 * coste de bcrypt en el camino del login no compra nada.
 */
export const twoFactorRecoveryCodes = sqliteTable(
  'two_factor_recovery_codes',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    codeHash: text('code_hash').notNull(),
    createdAt: text('created_at').notNull().default("datetime('now')"),
    usedAt: text('used_at'),
  },
  (table) => ({
    userCodeUnq: unique('two_factor_recovery_user_code').on(table.userId, table.codeHash),
    userIdx: index('idx_two_factor_recovery_user').on(table.userId),
  }),
)

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

/** Tokens de reseteo de contraseña, un solo uso, hasheados (SHA-256), con TTL. */
export const passwordResetTokens = sqliteTable('password_reset_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default("datetime('now')"),
  usedAt: text('used_at'),
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

/**
 * Catalogo de identificacion: WMI (3 primeros caracteres del VIN) → fabricante.
 *
 * Nace sembrado con la asignacion oficial ISO 3779 (`source: 'seed'`), que es
 * dato fijo igual que los PID Mode 01 de la SAE J1979, y crece con lo que
 * resuelve la cascada (`web`) o aporta el mecanico (`mechanic`).
 *
 * **No guarda modelo a proposito**: el WMI identifica al fabricante, no al
 * modelo. El modelo vive en {@link vehicles}, por VIN.
 */
export const vehicleIdentities = sqliteTable('vehicle_identities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  wmi: text('wmi').notNull().unique(),
  manufacturer: text('manufacturer').notNull(),
  confidence: real('confidence').notNull().default(0.3),
  source: text('source').notNull().default('web'),
  createdAt: text('created_at').notNull().default("datetime('now')"),
})

/** Catalogo auto-expansivo de definiciones de ECU por fabricante, modelo y
 *  direccion CAN. Nace con un seed minimo de direcciones con evidencia real
 *  verificada (ver `MANUFACTURER_ECU_SEEDS`) y se completa por aprendizaje
 *  (web / mecanico). */
export const ecuDefinitions = sqliteTable(
  'ecu_definitions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    manufacturer: text('manufacturer').notNull(),
    model: text('model').notNull(),
    responseAddr: text('response_addr').notNull(),
    requestAddr: text('request_addr').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    system: text('system'),
    confidence: real('confidence').notNull().default(0.3),
    source: text('source').notNull().default('web'),
    createdAt: text('created_at').notNull().default("datetime('now')"),
  },
  (table) => ({
    unq: unique('ecu_manufacturer_model_response_addr').on(
      table.manufacturer,
      table.model,
      table.responseAddr,
    ),
  }),
)

/**
 * Contador de peticiones por limitador y cliente, para que el rate limiting
 * sobreviva al reinicio del proceso.
 *
 * La clave primaria es el par `(namespace, client_key)`: `namespace` identifica
 * al limitador —cada `createRateLimiter` declara el suyo— y `client_key` es la
 * clave que resuelve `express-rate-limit`, hoy la IP del cliente. Sin el
 * `namespace` los diez limitadores de `server.ts` compartirian fila para una
 * misma IP y agotar uno agotaria los demas.
 *
 * `reset_at` es epoch en milisegundos, no texto ISO: se compara en cada
 * peticion y su indice es lo que hace barata la purga de ventanas vencidas.
 */
export const rateLimitCounters = sqliteTable(
  'rate_limit_counters',
  {
    namespace: text('namespace').notNull(),
    clientKey: text('client_key').notNull(),
    hits: integer('hits').notNull().default(0),
    resetAt: integer('reset_at').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.namespace, table.clientKey] }),
    resetAtIdx: index('idx_rate_limit_counters_reset_at').on(table.resetAt),
  }),
)
