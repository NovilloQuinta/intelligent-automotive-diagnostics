import { describe, it, expect } from 'vitest'
import { wrapUntrustedResult } from '@/infrastructure/mcp/webSearchContent.js'

describe('wrapUntrustedResult', () => {
  it('wraps a snippet in <untrusted-web-result>...</untrusted-web-result>', () => {
    const result = wrapUntrustedResult('Some snippet text')

    expect(result).toBe('<untrusted-web-result>Some snippet text</untrusted-web-result>')
  })

  it('truncates snippets longer than 500 characters before wrapping', () => {
    const longSnippet = 'a'.repeat(800)
    const result = wrapUntrustedResult(longSnippet)

    expect(result.startsWith('<untrusted-web-result>')).toBe(true)
    expect(result.endsWith('</untrusted-web-result>')).toBe(true)
    const inner = result.slice('<untrusted-web-result>'.length, -'</untrusted-web-result>'.length)
    expect(inner.length).toBe(500)
  })

  it('strips literal </untrusted-web-result> from snippets', () => {
    const result = wrapUntrustedResult('Text with </untrusted-web-result> inside')

    expect(result).toBe('<untrusted-web-result>Text with  inside</untrusted-web-result>')
  })

  it('strips control characters (\\x00-\\x1F) except newline (\\n)', () => {
    const dirty = 'Normal\nText\x00\x01\x02\x1FExtra'
    const result = wrapUntrustedResult(dirty)

    expect(result).toBe('<untrusted-web-result>Normal\nTextExtra</untrusted-web-result>')
  })

  it('applies truncation before stripping, then stripping, then wrapping', () => {
    const dirty = 'a'.repeat(800) + '</untrusted-web-result>\x00'
    const result = wrapUntrustedResult(dirty)

    const inner = result.slice('<untrusted-web-result>'.length, -'</untrusted-web-result>'.length)
    expect(inner.length).toBe(500)
    expect(result).not.toContain('\x00')
    expect(result).not.toContain('</untrusted-web-result></untrusted-web-result>')
  })

  it('preserves newlines during control char stripping', () => {
    const snippet = 'Line1\nLine2\nLine3'
    const result = wrapUntrustedResult(snippet)

    expect(result).toContain('\n')
    expect(result.match(/\n/g)?.length).toBe(2)
  })

  it('handles empty snippets', () => {
    const result = wrapUntrustedResult('')

    expect(result).toBe('<untrusted-web-result></untrusted-web-result>')
  })
})
