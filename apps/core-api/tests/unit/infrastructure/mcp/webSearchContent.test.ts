import { describe, it, expect } from 'vitest'

// RED phase: wrapUntrustedResult doesn't exist yet — these imports will fail

describe('wrapUntrustedResult - RED', () => {
  it('wraps a snippet in <untrusted-web-result>...</untrusted-web-result>', async () => {
    // Dynamic import - will fail because module doesn't exist
    const { wrapUntrustedResult } = await import('@/infrastructure/mcp/webSearchContent.js')

    const result = wrapUntrustedResult('Some snippet text')

    expect(result).toBe('<untrusted-web-result>Some snippet text</untrusted-web-result>')
  })

  it('truncates snippets longer than MAX_SNIPPET_LENGTH (500) before wrapping', async () => {
    const { wrapUntrustedResult } = await import('@/infrastructure/mcp/webSearchContent.js')

    // 800 characters
    const longSnippet = 'a'.repeat(800)
    const result = wrapUntrustedResult(longSnippet)

    expect(result.startsWith('<untrusted-web-result>')).toBe(true)
    expect(result.endsWith('</untrusted-web-result>')).toBe(true)
    // The wrapped content (excluding delimiters) should be exactly 500 chars
    const inner = result.slice('<untrusted-web-result>'.length, -'</untrusted-web-result>'.length)
    expect(inner.length).toBe(500)
  })

  it('strips literal </untrusted-web-result> from snippets', async () => {
    const { wrapUntrustedResult } = await import('@/infrastructure/mcp/webSearchContent.js')

    const result = wrapUntrustedResult('Text with </untrusted-web-result> inside')

    expect(result).toBe('<untrusted-web-result>Text with  inside</untrusted-web-result>')
  })

  it('strips control characters (\\x00-\\x1F) except newline (\\n)', async () => {
    const { wrapUntrustedResult } = await import('@/infrastructure/mcp/webSearchContent.js')

    const dirty = 'Normal\nText\x00\x01\x02\x1FExtra'
    const result = wrapUntrustedResult(dirty)

    expect(result).toBe('<untrusted-web-result>Normal\nTextExtra</untrusted-web-result>')
  })

  it('applies truncation before stripping, then stripping, then wrapping', async () => {
    const { wrapUntrustedResult } = await import('@/infrastructure/mcp/webSearchContent.js')

    // Long snippet with delimiter and control chars
    const dirty = 'a'.repeat(800) + '</untrusted-web-result>\x00'
    const result = wrapUntrustedResult(dirty)

    const inner = result.slice('<untrusted-web-result>'.length, -'</untrusted-web-result>'.length)
    // Should be 500 chars after truncation, stripped of delimiter and control chars
    expect(inner.length).toBe(500)
    expect(result).not.toContain('\x00')
    expect(result).not.toContain('</untrusted-web-result></untrusted-web-result>')
  })
})
