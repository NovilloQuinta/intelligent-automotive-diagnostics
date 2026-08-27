import { describe, it, expect } from 'vitest'
import express, { type Router, type RequestHandler } from 'express'

import { openApiSpec } from '@/infrastructure/http/openapi/buildOpenApiDocument.js'
import { createServer, type ServerDependencies } from '@/infrastructure/http/server.js'
import type { AuditLogRepository } from '@/application/ports/AuditLogRepository.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AuthController } from '@/infrastructure/http/controllers/AuthController.js'
import type { ProfileController } from '@/infrastructure/http/controllers/ProfileController.js'
import type { TwoFactorController } from '@/infrastructure/http/controllers/TwoFactorController.js'
import type { AdminController } from '@/infrastructure/http/controllers/AdminController.js'
import type { DiagnosisController } from '@/infrastructure/http/controllers/DiagnosisController.js'

/**
 * Colaborador de pega: montar la aplicacion solo lee referencias a metodos para
 * registrarlas, nunca las invoca —aqui no se sirve ninguna peticion—. Un Proxy que
 * devuelve un handler vacio para cualquier propiedad evita enumerar los metodos de
 * los cinco controladores, del repositorio de auditoria y del logger.
 */
function stub<T>(): T {
  const noop: RequestHandler = () => {}
  return new Proxy({}, { get: () => noop }) as T
}

/**
 * Dependencias con las que se monta la aplicacion para inspeccionarla.
 *
 * El tipo es `Required<ServerDependencies>` **a proposito**: obliga a rellenar tambien
 * los colaboradores opcionales. Si manana se anade uno nuevo y nadie lo pone aqui, el
 * typecheck falla — sin esa red, el router que dependa de el no se montaria y sus rutas
 * quedarian fuera de la comprobacion en silencio, que es exactamente el fallo que esta
 * version viene a cerrar.
 */
function serverDependencies(): Required<ServerDependencies> {
  const noop: RequestHandler = () => {}
  return {
    rateLimit: {},
    adminRateLimit: {},
    auditRepo: stub<AuditLogRepository>(),
    authController: stub<AuthController>(),
    diagnosisController: stub<DiagnosisController>(),
    profileController: stub<ProfileController>(),
    twoFactorController: stub<TwoFactorController>(),
    adminController: stub<AdminController>(),
    requireAdmin: noop,
    // Con secreto, `createAuthMiddleware` existe y `GET /api/auth/me` llega a registrarse.
    accessTokenSecret: 'openapi-sync-test-secret',
    allowedOrigins: '*',
    nodeEnv: 'test',
    logger: stub<LoggerPort>(),
  }
}

/** Un router de Express se distingue del middleware suelto por su pila de capas. */
function isRouter(handler: unknown): handler is Router {
  return typeof handler === 'function' && Array.isArray((handler as { stack?: unknown[] }).stack)
}

/**
 * Prefijo de montaje y router de cada router que la aplicacion monta de verdad.
 *
 * **Aqui no hay lista que mantener, y ese es el punto.** Se intercepta `app.use` mientras
 * `createServer` arranca y se recogen las llamadas cuyo argumento es un router —los que
 * traen `stack`—, descartando el middleware suelto: rate limiters, helmet, swagger-ui y el
 * manejador de errores. Un router nuevo entra en esta comprobacion por el mero hecho de
 * montarse en `server.ts`.
 *
 * La version anterior enumeraba los routers a mano y por eso no protegia de nada nuevo:
 * al llegar `twoFactor.routes.ts`, sus cuatro rutas se sirvieron sin documentar con este
 * test en verde, porque el router no estaba en aquella lista.
 *
 * El parcheo es sobre el prototipo de aplicacion de Express y se deshace en un `finally`,
 * de modo que un fallo al montar no deja el modulo tocado para el resto de la suite.
 */
function mountedRouters(): { prefix: string; router: Router }[] {
  const application = (express as unknown as { application: Record<string, unknown> }).application
  const originalUse = application.use as (this: unknown, ...args: unknown[]) => unknown
  const mounted: { prefix: string; router: Router }[] = []

  application.use = function (this: unknown, ...args: unknown[]) {
    const [prefix, ...handlers] = args
    if (typeof prefix === 'string') {
      for (const handler of handlers) {
        if (isRouter(handler)) mounted.push({ prefix, router: handler })
      }
    }
    return originalUse.apply(this, args)
  }

  try {
    createServer(serverDependencies())
  } finally {
    application.use = originalUse
  }

  return mounted
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
 * Rutas realmente servidas por la aplicacion, leidas de los routers que monta.
 *
 * Quedan fuera las rutas que `server.ts` registra directamente sobre la app y no via
 * router (`/health`, `/`, `/api`, `/api-docs.json`): son redirecciones y sonda de vida,
 * no superficie de la API, y el documento OpenAPI tampoco las declara.
 */
function actualRoutes(): string[] {
  return mountedRouters().flatMap(({ prefix, router }) => collectRoutes(router, prefix))
}

/** Operaciones declaradas en el documento OpenAPI, en el mismo formato `METODO ruta`. */
function documentedOperations(): string[] {
  const paths = openApiSpec.paths as Record<string, Record<string, unknown>>
  return Object.entries(paths).flatMap(([path, operations]) =>
    Object.keys(operations).map((method) => `${method.toUpperCase()} ${path}`),
  )
}

describe('sincronia entre las rutas de Express y el documento OpenAPI', () => {
  // Las dos pruebas de abajo comparan conjuntos: si el descubrimiento se rompiera y
  // devolviera vacio, las dos pasarian sin comprobar nada. Este es el cinturon.
  it('descubre las rutas montadas, sin lista que mantener', () => {
    const routes = actualRoutes()

    expect(routes.length).toBeGreaterThan(20)
    // El segundo factor es el caso que motivo este cambio: sus cuatro rutas vivian en un
    // router que la version anterior no miraba, y se sirvieron sin documentar en verde.
    expect(routes).toEqual(
      expect.arrayContaining([
        'POST /api/auth/2fa/verify',
        'POST /api/profile/2fa/setup',
        'POST /api/profile/2fa/activate',
        'POST /api/profile/2fa/disable',
      ]),
    )
  })

  // El descubrimiento parchea el prototipo de Express: si no lo devolviera a su sitio,
  // ensuciaria cualquier test posterior que monte un servidor.
  it('deja intacto el prototipo de Express al terminar', () => {
    const application = (express as unknown as { application: Record<string, unknown> }).application
    const before = application.use

    actualRoutes()

    expect(application.use).toBe(before)
  })

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

/** Schemas publicados en `components.schemas`, con su nombre. */
function componentSchemas(): [string, Record<string, unknown>][] {
  const components = openApiSpec.components as {
    schemas: Record<string, Record<string, unknown>>
  }
  return Object.entries(components.schemas)
}

/** Parametros de todas las operaciones, etiquetados con la operacion que los declara. */
function allParameters(): { label: string; parameter: Record<string, unknown> }[] {
  const paths = openApiSpec.paths as Record<string, Record<string, Record<string, unknown>>>
  return Object.entries(paths).flatMap(([path, operations]) =>
    Object.entries(operations).flatMap(([method, operation]) =>
      ((operation.parameters ?? []) as Record<string, unknown>[]).map((parameter) => ({
        label: `${method.toUpperCase()} ${path} ?${String(parameter.name)}`,
        parameter,
      })),
    ),
  )
}

/**
 * El documento se genera desde el codigo, asi que nada obliga a que sea *legible*: un
 * schema sin descripciones ni ejemplos sigue siendo valido y Swagger UI lo pinta vacio.
 * Estas pruebas son ese contrato — el que se perdio al sustituir el `swagger.ts` escrito
 * a mano, que si traia ejemplos.
 */
describe('legibilidad del documento OpenAPI', () => {
  it('describe todos los schemas publicados', () => {
    const sinDescripcion = componentSchemas()
      .filter(([, schema]) => typeof schema.description !== 'string')
      .map(([name]) => name)

    expect(sinDescripcion).toEqual([])
  })

  it('describe todas las propiedades de cada schema', () => {
    const sinDescripcion = componentSchemas().flatMap(([name, schema]) =>
      Object.entries((schema.properties ?? {}) as Record<string, Record<string, unknown>>)
        .filter(([, property]) => typeof property.description !== 'string')
        .map(([property]) => `${name}.${property}`),
    )

    expect(sinDescripcion).toEqual([])
  })

  it('da un ejemplo de cuerpo en cada schema de peticion', () => {
    const sinEjemplo = componentSchemas()
      .filter(([name]) => name.endsWith('Request'))
      .filter(([, schema]) => schema.example === undefined)
      .map(([name]) => name)

    expect(sinEjemplo).toEqual([])
  })

  it('da un ejemplo en cada parametro de ruta y de query', () => {
    const sinEjemplo = allParameters()
      .filter(({ parameter }) => parameter.example === undefined)
      .map(({ label }) => label)

    expect(sinEjemplo).toEqual([])
  })
})
