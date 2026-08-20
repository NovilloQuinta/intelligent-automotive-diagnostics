import { z } from 'zod'

import { LlmConversationItemSchema } from '@/application/dto/llm/LlmConversationItemSchema.js'
import { ALL_SEED_PIDS } from '@/domain/catalogs/pidCatalog.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'

/**
 * Contratos de entrada de los endpoints de diagnostico.
 *
 * Viven aqui, junto a los de auth, perfil y admin, porque son lo que valida la
 * peticion antes de llegar al caso de uso. El controlador solo elige cual aplicar y
 * traduce el fallo a un 400.
 *
 * Cada endpoint declara **dos** variantes: en modo emulador hay que decir a que
 * vehiculo se habla, y en conexion directa solo hay uno, asi que `scenarioId` pasa
 * de obligatorio a opcional. `DiagnosisService.isDirectConnection` decide cual rige.
 */

/** scenarioId obligatorio: modo simulacion, donde hay que elegir escenario. */
const requiredScenarioId = z
  .string()
  .min(1, 'scenarioId is required')
  .describe('Vehiculo emulado al que hablar. Se obtiene de `GET /api/scenarios`')

/** scenarioId opcional: modo TCP directo, donde solo hay un vehiculo conectado. */
const optionalScenarioId = z
  .string()
  .min(1)
  .optional()
  .describe('Ignorado en conexion directa: solo hay un vehiculo conectado')

/**
 * Crea el par docker/tcp de esquemas Zod para un endpoint, aplicando
 * `scenarioId` requerido u opcional segun el modo de conexion.
 */
function scenarioSchemas<T extends Record<string, z.ZodTypeAny>>(
  extra: T,
  description = 'Peticion de diagnostico sobre un vehiculo',
): {
  docker: z.ZodObject<{ scenarioId: z.ZodString } & T>
  tcp: z.ZodObject<{ scenarioId: z.ZodOptional<z.ZodString> } & T>
} {
  return {
    docker: z.object({ scenarioId: requiredScenarioId, ...extra }).describe(description),
    tcp: z.object({ scenarioId: optionalScenarioId, ...extra }).describe(description),
  }
}

/** Cuerpo de `POST /api/diagnosis`: exige `scenarioId` en modo emulador y lo omite en conexion directa. */
export const { docker: DiagnosisBodySchema, tcp: DiagnosisBodyTcpSchema } = scenarioSchemas(
  {},
  'Cuerpo de `POST /api/diagnosis`: lanza el diagnostico determinista sobre un vehiculo',
)

/** Cuerpo de `POST /api/mcp/tools/:toolName`: escenario mas los argumentos de la tool. */
export const { docker: McpToolBodySchema, tcp: McpToolBodyTcpSchema } = scenarioSchemas(
  {
    args: z
      .record(z.unknown())
      .default({})
      .describe('Argumentos de la tool. La forma depende de la tool invocada'),
  },
  'Cuerpo de `POST /api/mcp/tools/{toolName}`: invocacion directa de una tool MCP',
)

/** Parametro de ruta de `POST /api/mcp/tools/:toolName`. */
export const McpToolParamsSchema = z.object({
  toolName: z.string().min(1),
})

/** Cuerpo de `POST /api/mcp/cognitive-diagnosis`: escenario, consulta, historial y sesion a continuar. */
export const { docker: CognitiveDiagnosisBodySchema, tcp: CognitiveDiagnosisBodyTcpSchema } =
  scenarioSchemas(
    {
      query: z
        .string()
        .optional()
        .describe('Pregunta del usuario. Si se omite, el agente hace el barrido completo'),
      history: z
        .array(LlmConversationItemSchema)
        .optional()
        .describe('Turnos previos de la conversacion, para continuar un diagnostico'),
      sessionId: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Sesion a continuar. Si se omite, se abre una nueva'),
    },
    'Cuerpo de `POST /api/mcp/cognitive-diagnosis`: diagnostico cognitivo con LLM',
  )

/** Query de `GET /api/freeze-frame`: el DTC concreto es opcional. */
export const { docker: FreezeFrameQuerySchema, tcp: FreezeFrameQueryTcpSchema } = scenarioSchemas({
  dtc: z.string().optional(),
})

/** Query de `GET /api/ecu-info`. */
export const { docker: EcuInfoQuerySchema, tcp: EcuInfoQueryTcpSchema } = scenarioSchemas({})

/** Query de `GET /api/vehicle-info`. */
export const { docker: VehicleInfoQuerySchema, tcp: VehicleInfoQueryTcpSchema } = scenarioSchemas(
  {},
)

/**
 * Identificacion que aporta el mecanico desde la pantalla de confirmacion.
 *
 * La validacion fuerte (normalizacion del nombre, forma de marca, WMI) vive en
 * el dominio: aqui solo se acota la forma del payload para no aceptar un JSON
 * cualquiera. Duplicar las reglas en zod las dejaria divergir.
 */
export const VehicleIdentityBodySchema = z
  .object({
    vin: z.string().length(17).describe('Numero de bastidor, exactamente 17 caracteres'),
    make: z.string().min(1).max(64).describe('Marca que declara el mecanico'),
    model: z.string().max(64).optional().describe('Modelo, si se conoce'),
    year: z
      .number()
      .int()
      .min(1980)
      .max(2100)
      .optional()
      .describe('Ano de fabricacion, si se conoce'),
    engineType: z.string().max(64).optional().describe('Motorizacion, si se conoce'),
  })
  .describe('Identidad del vehiculo aportada a mano desde la pantalla de confirmacion')

/** Códigos de PID Mode 01 válidos (SAE J1979) según el catálogo de seed data. */
const MODE_01_PID_CODES = new Set(
  ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => p.pidCode.pid),
)

/** Número máximo de PIDs simultáneos en un comando multi-PID (design D6). */
export const MAX_LIVE_PIDS = 8

/** Query param `pids` opcional: lista separada por comas de códigos de PID Mode 01. */
const PidsQuerySchema = z
  .string()
  .optional()
  .transform((raw) =>
    raw === undefined || raw.trim() === ''
      ? undefined
      : raw.split(',').map((p) => p.trim().toUpperCase()),
  )
  .refine((pids) => pids === undefined || pids.length <= MAX_LIVE_PIDS, {
    message: `Maximum ${MAX_LIVE_PIDS} PIDs allowed`,
  })
  .refine((pids) => pids === undefined || pids.every((pid) => MODE_01_PID_CODES.has(pid)), {
    message: 'Invalid PID code',
  })

/** Query de `GET /api/live-data`, con la lista de PIDs a leer. */
export const { docker: LiveDataQuerySchema, tcp: LiveDataQueryTcpSchema } = scenarioSchemas({
  pids: PidsQuerySchema,
})

/** Cuerpo de `POST /api/clear-dtc` (Service 04). */
export const { docker: ClearDtcBodySchema, tcp: ClearDtcBodyTcpSchema } = scenarioSchemas({})

/** Query de `GET /api/pending-dtc` (Service 07). */
export const { docker: PendingDtcQuerySchema, tcp: PendingDtcQueryTcpSchema } = scenarioSchemas({})

/** Query de `GET /api/permanent-dtc` (Service 0A). */
export const { docker: PermanentDtcQuerySchema, tcp: PermanentDtcQueryTcpSchema } = scenarioSchemas(
  {},
)

/** Query de `GET /api/vehicle-status`. */
export const { docker: VehicleStatusQuerySchema, tcp: VehicleStatusQueryTcpSchema } =
  scenarioSchemas({})

/** Filtros de listado del historial — todos opcionales,
 *  `userId` nunca viaja en query (se toma del token). */
export const DiagnosisHistoryQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  scenarioId: z.string().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

/** Parametro de ruta para GET /api/diagnosis-history/:id */
export const DiagnosisSessionIdSchema = z.object({
  id: z.coerce.number().int().min(1),
})
