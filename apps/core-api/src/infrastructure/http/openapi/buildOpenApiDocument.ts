import { zodToJsonSchema } from 'zod-to-json-schema'

import type { OperationSpec, SchemaMap } from './registry.js'
import { openApiSchemas } from './schemas.js'
import { authOperations } from './routes/auth.js'
import { diagnosisOperations } from './routes/diagnosis.js'
import { mcpOperations } from './routes/mcp.js'
import { adminOperations } from './routes/admin.js'

/**
 * Todas las operaciones que la API documenta, en el orden en que se muestran.
 *
 * Cada entrada vive junto al router que la sirve (`openapi/routes/`). Un test recorre
 * los routers reales de Express y falla si alguna ruta no esta aqui, de modo que el
 * documento no puede quedarse atras del codigo.
 */
const ALL_OPERATIONS: readonly OperationSpec[] = [
  ...authOperations,
  ...diagnosisOperations,
  ...mcpOperations,
  ...adminOperations,
]

/** Metadatos fijos del documento. */
const DOCUMENT_INFO = {
  title: 'Intelligent Automotive Diagnostics API',
  version: '0.3.0',
  description:
    'API REST para diagnostico automotriz sobre OBD-II, con vehiculos emulados y soporte de ' +
    'adaptador ELM327 real. PIDs estandar SAE J1979 y propietarios de fabricante (Mode 22), ' +
    'catalogo auto-expansivo con busqueda vectorial y diagnostico cognitivo via MCP. ' +
    'Autenticacion JWT Bearer.\n\n' +
    'Este documento **se genera desde el codigo**: los schemas salen de los mismos objetos Zod ' +
    'que validan en runtime y la lista de rutas se contrasta contra los routers de Express.',
  contact: { name: 'Jesus Novillo', email: 'jesus.novillo@evenia.ad' },
} as const

/** Agrupaciones que Swagger UI usa para ordenar la navegacion. */
const DOCUMENT_TAGS = [
  { name: 'Auth', description: 'Registro, login, tokens JWT, recuperacion de contrasena y perfil' },
  { name: 'Diagnosis', description: 'Operaciones de diagnostico OBD-II sobre el vehiculo' },
  {
    name: 'MCP',
    description:
      'Capa Model Context Protocol: capacidades, invocacion directa de tools y diagnostico ' +
      'cognitivo con LLM',
  },
  {
    name: 'Admin',
    description:
      'Panel de administracion: usuarios, logs, auditoria HTTP y catalogo vectorial. Requiere ' +
      'rol admin y tiene su propio rate limit.',
  },
] as const

/** Referencia a un schema publicado en `components.schemas`. */
function refTo(name: string): { $ref: string } {
  return { $ref: `#/components/schemas/${name}` }
}

/** Cuerpo JSON obligatorio que apunta a un schema del catalogo. */
function requestBodyFor(name: string): Record<string, unknown> {
  return { required: true, content: { 'application/json': { schema: refTo(name) } } }
}

/** Respuestas de una operacion; las que no declaran schema quedan sin cuerpo. */
function responsesFor(operation: OperationSpec): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(operation.responses).map(([status, response]) => [
      status,
      response.schema
        ? {
            description: response.description,
            content: { 'application/json': { schema: refTo(response.schema) } },
          }
        : { description: response.description },
    ]),
  )
}

/** Seguridad y parametros, omitidos cuando no aplican: OpenAPI distingue ausente de vacio. */
function accessFields(operation: OperationSpec): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (operation.auth) fields.security = [{ bearerAuth: [] }]
  if (operation.parameters?.length) fields.parameters = operation.parameters
  return fields
}

/** Descripcion larga y cuerpo de la peticion, ambos opcionales. */
function contentFields(operation: OperationSpec): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  if (operation.description) fields.description = operation.description
  if (operation.requestBody) fields.requestBody = requestBodyFor(operation.requestBody)
  return fields
}

/** Traduce una operacion del registro al objeto que espera OpenAPI. */
function toPathItem(operation: OperationSpec): Record<string, unknown> {
  return {
    tags: [operation.tag],
    summary: operation.summary,
    ...contentFields(operation),
    ...accessFields(operation),
    responses: responsesFor(operation),
  }
}

/**
 * Convierte el catalogo de schemas Zod a JSON Schema en el dialecto de OpenAPI 3.0.
 *
 * `$refStrategy: 'none'` desanida las referencias internas que generaria zod: cada
 * schema del catalogo se publica completo bajo su nombre, que es lo que hace legible
 * el documento en Swagger UI.
 */
function buildComponentSchemas(schemas: SchemaMap): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(schemas).map(([name, schema]) => [
      name,
      zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }),
    ]),
  )
}

/** Agrupa las operaciones por ruta: OpenAPI indexa primero por path y luego por metodo. */
function buildPaths(operations: readonly OperationSpec[]): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const operation of operations) {
    paths[operation.path] ??= {}
    paths[operation.path][operation.method] = toPathItem(operation)
  }
  return paths
}

/**
 * Compone el documento OpenAPI completo a partir del registro de operaciones y del
 * catalogo de schemas Zod.
 *
 * @param operations - Operaciones a documentar. Por defecto, todas las de la API.
 * @param schemas - Catalogo de schemas. Por defecto, el de `schemas.ts`.
 * @returns El documento OpenAPI 3.0.3 listo para servir.
 */
export function buildOpenApiDocument(
  operations: readonly OperationSpec[] = ALL_OPERATIONS,
  schemas: SchemaMap = openApiSchemas,
): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: DOCUMENT_INFO,
    servers: [{ url: 'http://localhost:4000', description: 'Local development' }],
    tags: DOCUMENT_TAGS,
    paths: buildPaths(operations),
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: buildComponentSchemas(schemas),
    },
  }
}

/** Documento OpenAPI de la aplicacion, generado al cargar el modulo. */
export const openApiSpec = buildOpenApiDocument()
