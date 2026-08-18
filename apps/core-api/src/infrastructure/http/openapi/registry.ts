import type { ZodTypeAny } from 'zod'

/**
 * Tipos del registro de operaciones que alimenta el documento OpenAPI.
 *
 * Cada router de Express declara sus operaciones en `openapi/routes/`, al lado de las
 * rutas que documentan. El constructor solo recorre lo declarado aqui: no hay una lista
 * paralela de rutas que mantener a mano.
 */

/** Metodos HTTP que la API expone. */
export type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete'

/** Parametro de ruta o de query, con su tipo primitivo. */
export interface ParameterSpec {
  readonly name: string
  readonly in: 'path' | 'query'
  readonly required?: boolean
  readonly description: string
  readonly schema: { readonly type: 'string' | 'integer' | 'number' | 'boolean' }
}

/** Respuesta de una operacion. `schema` se omite en los cuerpos vacios. */
export interface ResponseSpec {
  readonly description: string
  /** Nombre del schema en `components.schemas`; debe existir en el mapa de schemas. */
  readonly schema?: string
}

/** Una operacion HTTP documentada. */
export interface OperationSpec {
  readonly method: HttpMethod
  /** Ruta completa en notacion OpenAPI, con los parametros entre llaves. */
  readonly path: string
  readonly tag: string
  readonly summary: string
  readonly description?: string
  /** `true` cuando la ruta exige `Authorization: Bearer`. */
  readonly auth?: boolean
  /** Nombre del schema del cuerpo de la peticion. */
  readonly requestBody?: string
  readonly parameters?: readonly ParameterSpec[]
  readonly responses: Readonly<Record<string, ResponseSpec>>
}

/**
 * Schemas Zod publicados en `components.schemas`, indexados por el nombre con el que
 * se referencian desde las operaciones.
 */
export type SchemaMap = Readonly<Record<string, ZodTypeAny>>
