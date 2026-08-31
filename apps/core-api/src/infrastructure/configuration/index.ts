import { z } from 'zod'

/** Clave de desarrollo, publica a proposito: 32 bytes de relleno en base64. */
const DEV_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0).toString('base64')

/** Boolean desde env: acepta 'true' (string) o true (boolean, por si ya viene parseado). */
const booleanFromEnv = (v: unknown): boolean => v === 'true' || v === true

/** Defaults de desarrollo para secretos, compartidos con la guardia de produccion. */
const DEV_ACCESS_SECRET_DEFAULT = 'dev-access-secret'
const DEV_REFRESH_SECRET_DEFAULT = 'dev-refresh-secret'
const DEV_SECRET_SENTINEL = 'change-me-in-production'

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    DB_PATH: z.string().default('data/diagnostics.db'),
    LANCEDB_PATH: z.string().min(1).default('data/lancedb'),
    OBD_MODE: z.enum(['docker', 'tcp', 'serial']).default('docker'),
    // Bloquea el borrado de DTC (Mode 04) frente a un vehiculo real. Los modos de
    // control UDS estan siempre bloqueados por la allowlist del dominio.
    OBD_READ_ONLY: z.preprocess(booleanFromEnv, z.boolean()).default(false),
    ELM327_HOST: z.string().default('localhost'),
    ELM327_PORT: z.coerce.number().int().positive().default(35000),
    ELM327_AUDI_HOST: z.string().default('localhost'),
    ELM327_AUDI_PORT: z.coerce.number().int().positive().default(35000),
    ELM327_KAWASAKI_HOST: z.string().default('localhost'),
    ELM327_KAWASAKI_PORT: z.coerce.number().int().positive().default(35001),
    ELM327_TOYOTA_HOST: z.string().default('localhost'),
    ELM327_TOYOTA_PORT: z.coerce.number().int().positive().default(35002),
    /** Traza cada intercambio con el adaptador por consola. Solo para seguimiento en vivo. */
    OBD_TRACE: z.preprocess(booleanFromEnv, z.boolean()).default(false),
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
    ACCESS_TOKEN_SECRET: z.string().min(1).default(DEV_ACCESS_SECRET_DEFAULT),
    REFRESH_TOKEN_SECRET: z.string().min(1).default(DEV_REFRESH_SECRET_DEFAULT),
    ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(604800),
    /**
     * Vida del refresh token cuando el usuario marca "Recordarme" en el login.
     * 30 dias por defecto. Se comprueba contra `REFRESH_TOKEN_TTL` mas abajo: un
     * valor menor haria que recordar la sesion la acortase, que es justo lo
     * contrario de lo que la casilla promete.
     */
    REMEMBER_ME_REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
    LLM_PROVIDER: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    LLM_API_KEY: z.string().optional(),
    LLM_BASE_URL: z.string().optional(),
    LLM_MODEL: z.string().optional(),
    /**
     * Temperatura del muestreo del LLM. Sin definir, el cliente aplica su propio
     * default mas bajo (`DEFAULT_TEMPERATURE`, 0.3): el 1.0 de fabrica del SDK es
     * bueno para charla libre, el peor valor posible para un agente que debe
     * seguir un contrato de formato y de ambito de forma consistente, y ademas
     * hace incomparables dos pasadas de `pnpm eval:agent` (la Messages API de
     * Anthropic no tiene `seed`, asi que esta es la unica palanca de determinismo
     * que hay). El rango se valida aqui como 0-2 porque lo comparten los dos
     * proveedores; cada cliente aplica ademas su propio limite mas estricto si
     * corresponde (0-1 en Anthropic).
     */
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.preprocess(booleanFromEnv, z.boolean()).default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    SMTP_FROM: z.string().default('no-reply@localhost'),
    APP_BASE_URL: z.string().default('http://localhost:5173'),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    WEB_SEARCH_API_KEY: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    ADMIN_PASSWORD: z.string().optional(),
  })
  .superRefine((config, ctx) => {
    if (config.REMEMBER_ME_REFRESH_TOKEN_TTL < config.REFRESH_TOKEN_TTL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['REMEMBER_ME_REFRESH_TOKEN_TTL'],
        message:
          'REMEMBER_ME_REFRESH_TOKEN_TTL debe ser mayor o igual que REFRESH_TOKEN_TTL: recordar la sesion no puede acortarla',
      })
    }
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
    config.ACCESS_TOKEN_SECRET === DEV_ACCESS_SECRET_DEFAULT ||
    config.ACCESS_TOKEN_SECRET === DEV_SECRET_SENTINEL
  ) {
    throw new Error('ACCESS_TOKEN_SECRET must be set in production')
  }
  if (
    config.REFRESH_TOKEN_SECRET === DEV_REFRESH_SECRET_DEFAULT ||
    config.REFRESH_TOKEN_SECRET === DEV_SECRET_SENTINEL
  ) {
    throw new Error('REFRESH_TOKEN_SECRET must be set in production')
  }
  if (config.TOTP_ENCRYPTION_KEY === DEV_TOTP_ENCRYPTION_KEY) {
    throw new Error('TOTP_ENCRYPTION_KEY must be set in production')
  }
}
