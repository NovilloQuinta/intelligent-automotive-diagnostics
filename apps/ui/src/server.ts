const CSP_HEADER =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data:; connect-src 'self'"

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response
}

let serverEntryPromise: Promise<ServerEntry> | undefined

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import('@tanstack/react-start/server-entry').then(
      (m) => (m.default ?? m) as ServerEntry,
    )
  }
  return serverEntryPromise
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry()
      const response = await handler.fetch(request, env, ctx)
      response.headers.set('Content-Security-Policy', CSP_HEADER)
      return response
    } catch {
      return new Response(
        '<!DOCTYPE html><html><head><title>Error</title></head><body><h1>Server Error</h1></body></html>',
        {
          status: 500,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'Content-Security-Policy': CSP_HEADER,
          },
        },
      )
    }
  },
}
