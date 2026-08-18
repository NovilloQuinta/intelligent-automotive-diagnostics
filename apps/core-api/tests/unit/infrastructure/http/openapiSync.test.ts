import { describe, it, expect } from 'vitest'
import type { Router, RequestHandler } from 'express'

import { openApiSpec } from '@/infrastructure/http/openapi/buildOpenApiDocument.js'
import { createAuthRoutes } from '@/infrastructure/http/routes/auth.routes.js'
import { createProfileRoutes } from '@/infrastructure/http/routes/profile.routes.js'
import { createAdminRoutes } from '@/infrastructure/http/routes/admin.routes.js'
import { createDiagnosisRoutes } from '@/infrastructure/http/routes/diagnosis.routes.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import type { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/**
 * Controlador de pega: los factories de rutas solo leen referencias a metodos para
 * registrarlas, nunca las invocan. Un Proxy que devuelve un handler vacio para
 * cualquier propiedad evita enumerar los metodos de los cuatro controladores.
 */
function stubController<T>(): T {
  const noop: RequestHandler = () => {}
  return new Proxy({}, { get: () => noop }) as T
}

/** Capa del stack de Express que corresponde a una ruta registrada. */
type RouteLayer = {
  readonly route?: {
    readonly path?: string
    readonly methods?: Record<string, boolean>
  }
}

/**
 * Convierte la ruta de Express a la notacion de OpenAPI: parametros `:id` pasan a
 * `{id}` y la ruta raiz de un router montado (`/`) colapsa en su propio prefijo.
 */
function toOpenApiPath(prefix: string, routePath: string): string {
  const full = routePath === '/' ? prefix : `${prefix}${routePath}`
  return full.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

/** Extrae `METODO ruta` de cada capa del router, ya con el prefijo de montaje aplicado. */
function collectRoutes(router: Router, prefix: string): string[] {
  const stack = (router as unknown as { stack: RouteLayer[] }).stack
  return stack.flatMap((layer) => {
    const route = layer.route
    if (!route?.path || !route.methods) return []
    return Object.entries(route.methods)
      .filter(([, enabled]) => enabled)
      .map(([method]) => `${method.toUpperCase()} ${toOpenApiPath(prefix, route.path as string)}`)
  })
}

/**
 * Rutas realmente servidas por la aplicacion, leidas de los routers de Express.
 *
 * Los prefijos replican los puntos de montaje de `server.ts`. `requireAuth` se pasa
 * porque `GET /api/auth/me` solo se registra cuando existe.
 */
function actualRoutes(): string[] {
  const noop: RequestHandler = () => {}
  return [
    ...collectRoutes(
      createAuthRoutes(stubController<AuthController>(), noop, noop, noop, noop),
      '/api/auth',
    ),
    ...collectRoutes(
      createProfileRoutes(stubController<ProfileController>(), noop),
      '/api/profile',
    ),
    ...collectRoutes(createAdminRoutes(stubController<AdminController>()), '/api/admin'),
    ...collectRoutes(createDiagnosisRoutes(stubController<DiagnosisController>()), '/api'),
  ]
}

/** Operaciones declaradas en el documento OpenAPI, en el mismo formato `METODO ruta`. */
function documentedOperations(): string[] {
  const paths = openApiSpec.paths as Record<string, Record<string, unknown>>
  return Object.entries(paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
  )
}

describe('sincronia entre las rutas de Express y el documento OpenAPI', () => {
  it('documenta todas las rutas que la aplicacion sirve', () => {
    const undocumented = actualRoutes()
      .filter((route) => !documentedOperations().includes(route))
      .sort()

    expect(undocumented).toEqual([])
  })

  it('no documenta rutas que no existen', () => {
    const phantom = documentedOperations()
      .filter((operation) => !actualRoutes().includes(operation))
      .sort()

    expect(phantom).toEqual([])
  })
})
