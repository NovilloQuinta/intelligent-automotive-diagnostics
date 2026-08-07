import { describe, it, expect } from 'vitest'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { WebSearchResult } from '@/application/dto/web-search/WebSearchResult.js'

function createFakeWebSearchPort(results: readonly WebSearchResult[] = []): WebSearchPort {
  return {
    async search(_query: string): Promise<readonly WebSearchResult[]> {
      return results
    },
  }
}

const sampleResults: readonly WebSearchResult[] = [
  { title: 'Test Result', snippet: 'A test snippet', url: 'https://example.com' },
]

describe('WebSearchPort', () => {
  it('should compile and allow a fake adapter implementing the port', async () => {
    const port = createFakeWebSearchPort(sampleResults)

    const result = await port.search('test query')

    expect(result).toHaveLength(1)
    expect(result[0].title).toBe('Test Result')
    expect(result[0].snippet).toBe('A test snippet')
    expect(result[0].url).toBe('https://example.com')
  })

  it('should return an empty array when the fake adapter has no results', async () => {
    const port = createFakeWebSearchPort([])

    const result = await port.search('no results')

    expect(result).toHaveLength(0)
  })
})
