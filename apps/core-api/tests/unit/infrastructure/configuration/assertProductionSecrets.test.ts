import { describe, it, expect } from 'vitest'
import { assertProductionSecrets } from '@/infrastructure/configuration/index.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    NODE_ENV: 'production',
    PORT: 4000,
    DB_PATH: ':memory:',
    LANCEDB_PATH: 'data/lancedb',
    OBD_MODE: 'sync',
    ELM327_HOST: 'localhost',
    ELM327_PORT: 35000,
    ALLOWED_ORIGINS: 'http://localhost:5173',
    ACCESS_TOKEN_SECRET: 'valid-access-secret',
    REFRESH_TOKEN_SECRET: 'valid-refresh-secret',
    ...overrides,
  }
}

describe('assertProductionSecrets', () => {
  it('no lanza en desarrollo', () => {
    expect(() => assertProductionSecrets(makeConfig({ NODE_ENV: 'development' }))).not.toThrow()
  })

  it('lanza con ACCESS_TOKEN_SECRET = dev-access-secret en produccion', () => {
    expect(() =>
      assertProductionSecrets(makeConfig({ ACCESS_TOKEN_SECRET: 'dev-access-secret' })),
    ).toThrow('ACCESS_TOKEN_SECRET must be set in production')
  })

  it('lanza con REFRESH_TOKEN_SECRET = dev-refresh-secret en produccion', () => {
    expect(() =>
      assertProductionSecrets(makeConfig({ REFRESH_TOKEN_SECRET: 'dev-refresh-secret' })),
    ).toThrow('REFRESH_TOKEN_SECRET must be set in production')
  })

  it('lanza con ACCESS_TOKEN_SECRET = change-me-in-production en produccion', () => {
    expect(() =>
      assertProductionSecrets(makeConfig({ ACCESS_TOKEN_SECRET: 'change-me-in-production' })),
    ).toThrow('ACCESS_TOKEN_SECRET must be set in production')
  })

  it('lanza con REFRESH_TOKEN_SECRET = change-me-in-production en produccion', () => {
    expect(() =>
      assertProductionSecrets(makeConfig({ REFRESH_TOKEN_SECRET: 'change-me-in-production' })),
    ).toThrow('REFRESH_TOKEN_SECRET must be set in production')
  })

  it('no lanza con secretos validos en produccion', () => {
    expect(() =>
      assertProductionSecrets(
        makeConfig({
          ACCESS_TOKEN_SECRET: 'prod-secret-abc123',
          REFRESH_TOKEN_SECRET: 'prod-refresh-xyz789',
        }),
      ),
    ).not.toThrow()
  })
})
