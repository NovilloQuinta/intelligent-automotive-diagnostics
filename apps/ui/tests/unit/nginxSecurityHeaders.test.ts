import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * La SPA compilada la sirve nginx dentro del contenedor de UI
 * (`apps/ui/Dockerfile`, etapa `runner`), no un proceso Node. Las cabeceras de
 * seguridad del documento HTML salen por tanto de la configuracion de nginx, y
 * este test es la unica red que hay: nadie ejecuta el contenedor en CI, asi que
 * borrar el `add_header` no rompe ningun otro test.
 *
 * No prueba que nginx las emita — eso exigiria levantar la imagen. Prueba que la
 * configuracion las declara y que la CSP permite lo que la aplicacion necesita
 * de verdad.
 */

const NGINX_DIR = resolve(__dirname, '../../nginx')

function readConf(name: string): string {
  return readFileSync(resolve(NGINX_DIR, name), 'utf-8')
}

describe('nginx security headers', () => {
  const headers = () => readConf('security-headers.conf')

  it('should declare a Content-Security-Policy', () => {
    expect(headers()).toMatch(/add_header\s+Content-Security-Policy\s+"/)
  })

  it('should mark the headers as `always` so they survive error responses', () => {
    const withoutAlways = headers()
      .split('\n')
      .filter((line) => line.trimStart().startsWith('add_header'))
      .filter((line) => !line.includes('always;'))

    expect(withoutAlways).toEqual([])
  })

  describe('the CSP', () => {
    const csp = () => /add_header\s+Content-Security-Policy\s+"([^"]+)"/.exec(headers())?.[1] ?? ''

    it.each([
      ["default-src 'self'", 'todo lo no declarado cae al propio origen'],
      ["script-src 'self'", 'el build de Vite no emite scripts inline'],
      ["object-src 'none'", 'no hay plugins que cargar'],
      ["base-uri 'self'", 'nadie puede reescribir la base de las URLs relativas'],
      ["frame-ancestors 'none'", 'equivalente moderno de X-Frame-Options: DENY'],
      ["form-action 'self'", 'ningun formulario postea fuera'],
      ["connect-src 'self'", 'la API va bajo el mismo origen detras de Caddy'],
    ])('should set %s — %s', (directive) => {
      expect(csp()).toContain(directive)
    })

    it('should allow the Google Fonts stylesheet that __root.tsx loads', () => {
      // routes/__root.tsx anade un <link rel="stylesheet"> a fonts.googleapis.com.
      // Sin esta fuente en style-src, la aplicacion se sirve sin tipografia.
      expect(csp()).toMatch(/style-src[^;]*https:\/\/fonts\.googleapis\.com/)
    })

    it('should allow the font files that stylesheet pulls from gstatic', () => {
      expect(csp()).toMatch(/font-src[^;]*https:\/\/fonts\.gstatic\.com/)
    })

    it("should keep 'unsafe-inline' out of script-src", () => {
      const scriptSrc = /script-src([^;]*)/.exec(csp())?.[1] ?? ''
      expect(scriptSrc).not.toContain('unsafe-inline')
    })
  })

  describe('default.conf', () => {
    const conf = () => readConf('default.conf')

    it('should include the headers at server level', () => {
      expect(conf()).toMatch(/include\s+\/etc\/nginx\/snippets\/security-headers\.conf;/)
    })

    it('should re-include them inside every location that adds its own header', () => {
      // nginx NO hereda los `add_header` del bloque padre en cuanto un
      // `location` declara el suyo. `location /assets/` pone Cache-Control, asi
      // que sin volver a incluirlas se quedaria sin cabeceras de seguridad.
      const assetsBlock = /location\s+\/assets\/\s*\{([^}]*)\}/.exec(conf())?.[1] ?? ''

      expect(assetsBlock).toContain('add_header Cache-Control')
      expect(assetsBlock).toMatch(/include\s+\/etc\/nginx\/snippets\/security-headers\.conf;/)
    })
  })
})
