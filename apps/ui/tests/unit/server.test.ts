import { describe, expect, it, vi } from 'vitest'
import server from '../../src/server'

// Mock the infrastructure boundary: the TanStack Start server entry is the
// HTTP server this handler delegates to. Normal requests resolve to a 200;
// requests to /error make the server entry throw, exercising the 500 fallback.
vi.mock('@tanstack/react-start/server-entry', () => ({
  default: {
    fetch: async (request: Request) => {
      if (request.url.includes('/error')) {
        throw new Error('simulated server-entry failure')
      }
      return new Response('ok', { status: 200 })
    },
  },
}))

const CSP_HEADER_VALUE =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'"

describe('server', () => {
  it('should include Content-Security-Policy header on successful responses', async () => {
    const response = await server.fetch(new Request('http://localhost/test'), {}, {})

    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toBe(CSP_HEADER_VALUE)
  })

  it('should include Content-Security-Policy header on 500 error fallback', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await server.fetch(new Request('http://localhost/error'), {}, {})

    expect(response.status).toBe(500)
    expect(response.headers.get('content-security-policy')).toBe(CSP_HEADER_VALUE)
  })
})
