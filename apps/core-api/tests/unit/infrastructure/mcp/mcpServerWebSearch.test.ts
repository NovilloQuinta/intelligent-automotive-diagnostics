import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { WebSearchProviderError } from '@/infrastructure/web-search/WebSearchProviderError.js'

describe('web_search tool in createMcpServer', () => {
  it('createMcpServer with webSearch includes web_search in listTools()', () => {
    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue([]),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)
    const tools = mcp.listTools()

    expect(tools.some((t) => t.name === 'web_search')).toBe(true)
  })

  it('without webSearch, listTools() does not include web_search', () => {
    const mockRepo = {} as never
    const mcp = createMcpServer(mockRepo, undefined, undefined)

    const tools = mcp.listTools()

    expect(tools.some((t) => t.name === 'web_search')).toBe(false)
  })

  it('web_search response contains <untrusted-web-result> delimiters', async () => {
    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi
        .fn()
        .mockResolvedValue([
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

  it('4th invocation (budget exhausted) returns isError client_error without calling search', async () => {
    const mockRepo = {} as never
    const mockWebSearch = {
      search: vi.fn().mockResolvedValue([{ title: 'T', snippet: 'S', url: 'https://x.com' }]),
    }

    const mcp = createMcpServer(mockRepo, undefined, undefined, mockWebSearch)

    await mcp.callTool('web_search', { query: 'q1' })
    await mcp.callTool('web_search', { query: 'q2' })
    await mcp.callTool('web_search', { query: 'q3' })

    const result = await mcp.callTool('web_search', { query: 'q4' })

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('client_error')
    expect(mockWebSearch.search).toHaveBeenCalledTimes(3)
  })

  it('search rejecting with WebSearchProviderError is categorized as external_error', async () => {
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
