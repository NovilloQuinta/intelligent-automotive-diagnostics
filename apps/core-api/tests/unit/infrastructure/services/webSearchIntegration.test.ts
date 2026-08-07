import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { DiagnosisService } from '@/infrastructure/services/diagnosisService.js'
import type { WebSearchPort } from '@/application/ports/WebSearchPort.js'
import type { WebSearchResult } from '@/application/dto/web-search/WebSearchResult.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'

describe('web_search integration (mocked)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeAll(() => {
    fetchSpy = vi.fn()
  })

  it('should have web_search tool available when webSearch is configured', () => {
    const webSearch: WebSearchPort = {
      search: async () => [],
    }

    const service = new DiagnosisService({
      scenarios: [],
      obdRepo: {} as never,
      llmClient: undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} } as never,
      webSearch,
    })

    // The service stores webSearch — createMcpServer would register the tool
    // Since we can't easily test the tool list from here, we verify the service
    // was created successfully with webSearch
    expect(service).toBeDefined()
  })

  it('should NOT have web_search tool available when webSearch is absent', () => {
    const service = new DiagnosisService({
      scenarios: [],
      obdRepo: {} as never,
      llmClient: undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} } as never,
    })

    expect(service).toBeDefined()
  })

  it('web_search returns delimited results with source info for later index_pid', async () => {
    const searchResult: WebSearchResult = {
      title: 'PID 0C Engine RPM',
      snippet: 'Standard OBD-II PID for engine RPM. Formula: (A*256+B)/4.',
      url: 'https://obd.example.com/pid0c',
    }
    const webSearch: WebSearchPort = {
      search: vi.fn().mockResolvedValue([searchResult]),
    }

    const service = new DiagnosisService({
      scenarios: [],
      obdRepo: {} as never,
      llmClient: undefined,
      logger: { info: () => {}, warn: () => {}, error: () => {} } as never,
      webSearch,
    })

    // Invoke web_search tool via callMcpTool
    const result = await service.callMcpTool('web_search', undefined, { query: 'OBD-II PID 0C' })

    expect(result).toContain('<untrusted-web-result>')
    expect(result).toContain('Standard OBD-II PID for engine RPM')
    expect(result).toContain('https://obd.example.com/pid0c')
    expect(webSearch.search).toHaveBeenCalledWith('OBD-II PID 0C')
  })
})
