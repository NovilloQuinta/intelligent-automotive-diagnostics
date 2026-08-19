import type { OperationSpec } from '../registry.js'

/** Respuestas comunes: todas estas rutas llegan detras de `requireAdmin`. */
const ADMIN_ERRORS = {
  '401': { description: 'Falta el token o no es valido' },
  '403': { description: 'El usuario no tiene rol admin' },
  '429': { description: 'Limite de peticiones superado' },
} as const

/** Paginacion compartida por los listados del panel. */
const PAGE_PARAMS = [
  {
    name: 'page',
    in: 'query' as const,
    description: 'Pagina, empezando en 1',
    example: 1,
    schema: { type: 'integer' as const },
  },
  {
    name: 'pageSize',
    in: 'query' as const,
    description: 'Tamano de pagina',
    example: 25,
    schema: { type: 'integer' as const },
  },
  {
    name: 'from',
    in: 'query' as const,
    description: 'Desde (ISO 8601)',
    example: '2026-08-01T00:00:00Z',
    schema: { type: 'string' as const },
  },
  {
    name: 'to',
    in: 'query' as const,
    description: 'Hasta (ISO 8601)',
    example: '2026-08-31T23:59:59Z',
    schema: { type: 'string' as const },
  },
]

/** Operaciones del panel de administracion. Acompanan a `admin.routes.ts`. */
export const adminOperations: readonly OperationSpec[] = [
  {
    method: 'get',
    path: '/api/admin/overview',
    tag: 'Admin',
    summary: 'Resumen del panel',
    description: 'Usuarios por tipo y rol, errores recientes y trafico HTTP aproximado por ruta.',
    auth: true,
    responses: { '200': { description: 'Resumen', schema: 'AdminOverview' }, ...ADMIN_ERRORS },
  },
  {
    method: 'get',
    path: '/api/admin/logs',
    tag: 'Admin',
    summary: 'Log de aplicacion',
    auth: true,
    parameters: [
      ...PAGE_PARAMS,
      {
        name: 'level',
        in: 'query',
        description: 'Nivel de log: `debug`, `info`, `warn` o `error`',
        example: 'error',
        schema: { type: 'string' },
      },
      {
        name: 'q',
        in: 'query',
        description: 'Busqueda en el mensaje',
        example: 'timeout',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'Pagina de logs', schema: 'AdminLogsPage' },
      ...ADMIN_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/admin/audit-logs',
    tag: 'Admin',
    summary: 'Auditoria de peticiones HTTP',
    description: 'Trazabilidad exigida por OWASP A09: metodo, ruta, codigo, IP, agente y duracion.',
    auth: true,
    parameters: PAGE_PARAMS,
    responses: {
      '200': { description: 'Pagina de auditoria', schema: 'AdminAuditLogsPage' },
      ...ADMIN_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/admin/users',
    tag: 'Admin',
    summary: 'Usuarios registrados',
    description: 'Incluye el estado de bloqueo por intentos fallidos de cada cuenta.',
    auth: true,
    parameters: PAGE_PARAMS,
    responses: {
      '200': { description: 'Pagina de usuarios', schema: 'AdminUsersPage' },
      ...ADMIN_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/admin/knowledge',
    tag: 'Admin',
    summary: 'Estado del catalogo auto-expansivo',
    description:
      'Cuantas entradas tiene cada indice vectorial (PIDs, DTCs y diagnosticos) y una muestra. ' +
      'Es la forma de ver que el sistema aprende con cada diagnostico.',
    auth: true,
    responses: {
      '200': { description: 'Estado de los indices', schema: 'KnowledgeStats' },
      ...ADMIN_ERRORS,
    },
  },
  {
    method: 'post',
    path: '/api/admin/knowledge/search',
    tag: 'Admin',
    summary: 'Busqueda semantica en el catalogo',
    description: 'Devuelve las entradas mas cercanas con su distancia vectorial.',
    auth: true,
    requestBody: 'KnowledgeSearchRequest',
    responses: {
      '200': { description: 'Resultados', schema: 'KnowledgeSearchResponse' },
      '400': { description: 'Cuerpo invalido' },
      ...ADMIN_ERRORS,
    },
  },
]
