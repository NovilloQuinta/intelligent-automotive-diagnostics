import { describe, it, expect, vi, afterEach } from 'vitest'

describe('WEB_SEARCH_API_KEY configuration - RED', () => {
  afterEach(() => {
    delete process.env.WEB_SEARCH_API_KEY
  })

  it('loadConfig() accepts WEB_SEARCH_API_KEY as optional without breaking schema', async () => {
    const { loadConfig } = await import('@/infrastructure/configuration/index.js')

    process.env.WEB_SEARCH_API_KEY = 'test-serpapi-key'
    process.env.ACCESS_TOKEN_SECRET = 'test-secret'
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh'
    process.env.LANCEDB_PATH = '/tmp/test-lancedb'

    const config = loadConfig()
    expect(config.WEB_SEARCH_API_KEY).toBe('test-serpapi-key')
  })

  it('loadConfig() works fine when WEB_SEARCH_API_KEY is not set', async () => {
    const { loadConfig } = await import('@/infrastructure/configuration/index.js')

    delete process.env.WEB_SEARCH_API_KEY
    process.env.ACCESS_TOKEN_SECRET = 'test-secret'
    process.env.REFRESH_TOKEN_SECRET = 'test-refresh'
    process.env.LANCEDB_PATH = '/tmp/test-lancedb'

    const config = loadConfig()
    expect(config.WEB_SEARCH_API_KEY).toBeUndefined()
  })

  it('createWebSearchPort returns undefined when WEB_SEARCH_API_KEY is not set', async () => {
    const { createWebSearchPort } = await import('@/infrastructure/composition/composition.js')

    delete process.env.WEB_SEARCH_API_KEY

    // This test will fail because createWebSearchPort doesn't exist yet
    const port = createWebSearchPort({} as never)
    expect(port).toBeUndefined()
  })
})
