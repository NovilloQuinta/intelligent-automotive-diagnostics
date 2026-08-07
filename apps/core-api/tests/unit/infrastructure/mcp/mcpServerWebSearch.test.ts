import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'

// RED phase: createMcpServer doesn't accept webSearch param yet —
// these imports will fail or assertions will fail

describe('web_search tool in createMcpServer - RED', () => {
  let originalFetch: typeof globalThis.fetch

  beforeAll(() => {
    originalFetch = globalThis.fetch
  })

  afterAll(() => {
    globalThis.fetch = originalFetch
  })

  it('createMcpServer with webSearch includes web_search in listTools()', async () => {
    // Dynamic import — createMcpServer doesn't accept webSearch yet
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')

    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue([]),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)
    const tools = mcp.listTools()

    expect(tools.some((t) => t.name === 'web_search')).toBe(true)
  })

  it('without webSearch, listTools() does not include web_search', async () => {
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')

    const mockRepo = {} as never
    const mcp = createMcpServer(mockRepo, undefined, undefined)

    const tools = mcp.listTools()

    expect(tools.some((t) => t.name === 'web_search')).toBe(false)
  })

  it('web_search response contains <untrusted-web-result> delimiters', async () => {
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')

    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue([
        { title: 'Test', snippet: 'Snippet text', url: 'https://example.com' },
      ]),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)
    const result = await mcp.callTool('web_search', { query: 'test query' })

    expect(result.content[0].text).toContain('<untrusted-web-result>')
    expect(result.content[0].text).toContain('</untrusted-web-result>')
    expect(result.content[0].text).toContain('Snippet text')
    expect(result.content[0].text).toContain('https://example.com')
  })

  it('web_search respects MAX_WEB_SEARCH_RESULTS (3) in response', async () => {
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')

    const mockRepo = {} as never
    const fourResults = [
      { title: 'R1', snippet: 'S1', url: 'https://1.com' },
      { title: 'R2', snippet: 'S2', url: 'https://2.com' },
      { title: 'R3', snippet: 'S3', url: 'https://3.com' },
      { title: 'R4', snippet: 'S4', url: 'https://4.com' },
    ]
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue(fourResults),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)
    const result = await mcp.callTool('web_search', { query: 'test' })

    // Count <untrusted-web-result> occurrences = number of results
    const matches = (result.content[0].text.match(/<untrusted-web-result>/g) || []).length
    expect(matches).toBeLessThanOrEqual(3)
  })

  it('4th invocation (budget exhausted) returns isError client_error without calling search', async () => {
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')

    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue([
        { title: 'T', snippet: 'S', url: 'https://x.com' },
      ]),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)

    // 3 calls that consume the budget
    await mcp.callTool('web_search', { query: 'q1' })
    await mcp.callTool('web_search', { query: 'q2' })
    await mcp.callTool('web_search', { query: 'q3' })

    // 4th call — budget exhausted
    const result = await mcp.callTool('web_search', { query: 'q4' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('client_error')
    // search should have been called only 3 times, not 4
    expect(mockWebSearch.search).toHaveBeenCalledTimes(3)
  })

  it('search rejecting with WebSearchProviderError is categorized as external_error', async () => {
    const { createMcpServer } = await import('@/infrastructure/mcp/mcpServer.js')
    // We need the error class
    const { WebSearchProviderError } = await import('@/infrastructure/web-search/WebSearchProviderError.js')

    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockRejectedValue(new WebSearchProviderError(429)),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)
    const result = await mcp.callTool('web_search', { query: 'test' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('external_error')
  })
})
