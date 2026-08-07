import { z } from 'zod'

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DB_PATH: z.string().default('data/diagnostics.db'),
  LANCEDB_PATH: z.string().min(1).default('data/lancedb'),
  OBD_MODE: z.enum(['docker', 'tcp']).default('docker'),
  ELM327_HOST: z.string().default('localhost'),
  ELM327_PORT: z.coerce.number().int().positive().default(35000),
  ELM327_AUDI_HOST: z.string().default('localhost'),
  ELM327_AUDI_PORT: z.coerce.number().int().positive().default(35000),
  ELM327_KAWASAKI_HOST: z.string().default('localhost'),
  ELM327_KAWASAKI_PORT: z.coerce.number().int().positive().default(35001),
  ELM327_TOYOTA_HOST: z.string().default('localhost'),
  ELM327_TOYOTA_PORT: z.coerce.number().int().positive().default(35002),
  ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://localhost:4173'),
  ACCESS_TOKEN_SECRET: z.string().min(1).default('dev-access-secret'),
  REFRESH_TOKEN_SECRET: z.string().min(1).default('dev-refresh-secret'),
  LLM_PROVIDER: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().optional(),
  LLM_MODEL: z.string().optional(),
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
}
