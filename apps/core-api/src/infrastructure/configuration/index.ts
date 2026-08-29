import { z } from 'zod'

/** Clave de desarrollo, publica a proposito: 32 bytes de relleno en base64. */
const DEV_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString('base64')

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DB_PATH: z.string().default('data/diagnostics.db'),
  LANCEDB_PATH: z.string().min(1).default('data/lancedb'),
  OBD_MODE: z.enum(['docker', 'tcp', 'serial']).default('docker'),
  // Bloquea el borrado de DTC (Mode 04) frente a un vehiculo real. Los modos de
  // control UDS estan siempre bloqueados por la allowlist del dominio.
  OBD_READ_ONLY: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  ELM327_HOST: z.string().default('localhost'),
  ELM327_PORT: z.coerce.number().int().positive().default(35000),
  ELM327_AUDI_HOST: z.string().default('localhost'),
  ELM327_AUDI_PORT: z.coerce.number().int().positive().default(35000),
  ELM327_KAWASAKI_HOST: z.string().default('localhost'),
  ELM327_KAWASAKI_PORT: z.coerce.number().int().positive().default(35001),
  ELM327_TOYOTA_HOST: z.string().default('localhost'),
  ELM327_TOYOTA_PORT: z.coerce.number().int().positive().default(35002),
  /** Traza cada intercambio con el adaptador por consola. Solo para seguimiento en vivo. */
  OBD_TRACE: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  SERIAL_PORT_PATH: z.string().default('/dev/ttyUSB0'),
  SERIAL_BAUD_RATE: z.coerce.number().int().positive().default(38400),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
  /**
   * Enciende o apaga el rate limiting con independencia de `NODE_ENV`. Sin
   * declarar, manda `NODE_ENV === 'production'`, que es el comportamiento
   * historico; por eso no lleva default. La lee `createRateLimiter`, que no
   * recibe `AppConfig`: aqui se declara para validarla en el arranque, porque un
   * `yes` aceptado en silencio dejaria produccion sin limites.
   */
  RATE_LIMIT_ENABLED: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['true', 'false']).optional(),
  ),
  /**
   * Clave AES-256 (32 bytes en base64) con la que se cifra el secreto TOTP en la
   * base de datos. Trae valor por defecto para que un clon limpio arranque, pero
   * `assertProductionSecrets` lo rechaza en produccion: con la clave del
   * repositorio, cifrar el secreto no protegeria de nada.
   */
  TOTP_ENCRYPTION_KEY: z.string().min(1).default(DEV_TOTP_ENCRYPTION_KEY),
  ACCESS_TOKEN_SECRET: z.string().min(1).default('dev-access-secret'),
  REFRESH_TOKEN_SECRET: z.string().min(1).default('dev-refresh-secret'),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
  LLM_PROVIDER: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  // Sin esto se corria al 1.0 por defecto del SDK — bueno para charla libre, el peor
  // valor posible para un agente que debe seguir un contrato de formato y de ambito de
  // forma consistente. El cliente aplica su propio default mas bajo si esto no esta.
  LLM_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('no-reply@localhost'),
  APP_BASE_URL: z.string().default('http://localhost:5173'),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  WEB_SEARCH_API_KEY: z.string().optional(),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
})

/** Configuracion tipada de la aplicacion validada desde variables de entorno. */
export type AppConfig = z.infer<typeof configSchema>

/** Valida y devuelve la configuracion tipada desde las variables de entorno. */
export function loadConfig(): AppConfig {
  return configSchema.parse(process.env)
}

/** Valida secretos de produccion: lanza si JWT secrets tienen valores por defecto o plantilla. */
export function assertProductionSecrets(config: AppConfig): void {
  if (config.NODE_ENV !== 'production') return
  if (
    config.ACCESS_TOKEN_SECRET === 'dev-access-secret' ||
    config.ACCESS_TOKEN_SECRET === 'change-me-in-production'
  ) {
    throw new Error('ACCESS_TOKEN_SECRET must be set in production')
  }
  if (
    config.REFRESH_TOKEN_SECRET === 'dev-refresh-secret' ||
    config.REFRESH_TOKEN_SECRET === 'change-me-in-production'
  ) {
    throw new Error('REFRESH_TOKEN_SECRET must be set in production')
  }
  if (config.TOTP_ENCRYPTION_KEY === DEV_TOTP_ENCRYPTION_KEY) {
    throw new Error('TOTP_ENCRYPTION_KEY must be set in production')
  }
}
