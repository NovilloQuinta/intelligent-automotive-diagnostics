import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { createSerpApiClient } from '@/infrastructure/web-search/serpApiClient.js'
import { WebSearchProviderError } from '@/infrastructure/web-search/WebSearchProviderError.js'

describe('createSerpApiClient', () => {
  let originalFetch: typeof globalThis.fetch

  beforeAll(() => {
    originalFetch = globalThis.fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('maps a valid SerpAPI organic_results response to WebSearchResult[]', async () => {
    const client = createSerpApiClient({ apiKey: 'test-key' })

    const mockResponse = {
      organic_results: [
        {
          title: 'PID 0C — Engine RPM',
          snippet: 'Standard OBD-II PID for engine RPM.',
          link: 'https://obd.example.com/pid0c',
        },
        {
          title: 'PID 05 — Coolant Temp',
          snippet: 'Coolant temperature sensor reading.',
          link: 'https://obd.example.com/pid05',
        },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const results = await client.search('OBD-II PID 0C')

    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('PID 0C — Engine RPM')
    expect(results[0].snippet).toBe('Standard OBD-II PID for engine RPM.')
    expect(results[0].url).toBe('https://obd.example.com/pid0c')
    expect(results[1].title).toBe('PID 05 — Coolant Temp')
  })

  it('throws WebSearchProviderError on non-OK HTTP response', async () => {
    const client = createSerpApiClient({ apiKey: 'test-key' })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
    } as Response)

    await expect(client.search('query')).rejects.toThrow(WebSearchProviderError)
  })

  it('discards malformed organic_results entries without invalidating valid ones', async () => {
    const client = createSerpApiClient({ apiKey: 'test-key' })

    const mockResponse = {
      organic_results: [
        { title: 'Good result', snippet: 'Valid snippet', link: 'https://ok.example.com' },
        { snippet: 'Missing title and link' },
        { title: 'Another good one', snippet: 'Also valid', link: 'https://also.example.com' },
      ],
    }
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    const results = await client.search('query')

    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('Good result')
    expect(results[1].title).toBe('Another good one')
  })

  it('throws WebSearchProviderError when SerpAPI returns HTTP 200 with error field', async () => {
    const client = createSerpApiClient({ apiKey: 'test-key' })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ error: 'Invalid API key' }),
    } as Response)

    await expect(client.search('query')).rejects.toThrow(WebSearchProviderError)
  })
})
