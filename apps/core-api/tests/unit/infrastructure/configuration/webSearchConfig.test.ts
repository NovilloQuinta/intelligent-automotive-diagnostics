import { describe, it, expect, afterEach } from 'vitest'
import { loadConfig } from '@/infrastructure/configuration/index.js'
import { createWebSearchPort } from '@/infrastructure/composition/llm.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

describe('WEB_SEARCH_API_KEY configuration', () => {
  afterEach(() => {
    delete process.env.WEB_SEARCH_API_KEY
  })

  it('loadConfig() accepts WEB_SEARCH_API_KEY as optional without breaking schema', () => {
    process.env.WEB_SEARCH_API_KEY = 'test-serpapi-key'
    process.env.ACCESS_TOKEN_SECRET = 'test-secret'
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh'
    process.env.LANCEDB_PATH = '/tmp/test-lancedb'

    const config = loadConfig()
    expect(config.WEB_SEARCH_API_KEY).toBe('test-serpapi-key')
  })

  it('loadConfig() works fine when WEB_SEARCH_API_KEY is not set', () => {
    delete process.env.WEB_SEARCH_API_KEY
    process.env.ACCESS_TOKEN_SECRET = 'test-secret'
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh'
    process.env.LANCEDB_PATH = '/tmp/test-lancedb'

    const config = loadConfig()
    expect(config.WEB_SEARCH_API_KEY).toBeUndefined()
  })

  it('createWebSearchPort returns undefined when WEB_SEARCH_API_KEY is not set', () => {
    const config: AppConfig = {
      WEB_SEARCH_API_KEY: undefined,
    } as AppConfig

    const port = createWebSearchPort(config)
    expect(port).toBeUndefined()
  })
})
