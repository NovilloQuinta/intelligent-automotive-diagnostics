import { describe, it, expect } from 'vitest'
import { createSerpApiClient } from '@/infrastructure/web-search/serpApiClient.js'

const API_KEY = process.env.WEB_SEARCH_API_KEY

describe('SerpAPI real endpoint verification', () => {
  it.runIf(!!API_KEY)(
    'searches for OBD-II PID 0C engine RPM diagnostic and returns results',
    async () => {
      const client = createSerpApiClient({ apiKey: API_KEY! })
      const results = await client.search('OBD-II PID 0C engine RPM diagnostic')

      console.log('Query: OBD-II PID 0C engine RPM diagnostic')
      console.log('Results count:', results.length)

      expect(results.length).toBeGreaterThan(0)
      expect(results.length).toBeLessThanOrEqual(3)
      expect(results[0].title).toBeTruthy()
      expect(results[0].url).toBeTruthy()
    },
    15000,
  )
})
