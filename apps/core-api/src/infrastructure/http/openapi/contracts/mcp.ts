import { z } from 'zod'

/**
 * Contratos de respuesta de la capa MCP: capacidades, invocacion directa de tools y
 * diagnostico cognitivo.
 *
 * Ninguno de estos endpoints estaba documentado antes de generar el spec desde el
 * codigo, pese a ser el nucleo del proyecto.
 */

/** Una herramienta invocada por el LLM durante la sesion, con sus argumentos y su salida. */
export const toolCallTraceSchema = z.object({
  tool: z.string(),
  args: z.record(z.unknown()),
  result: z.string(),
})

/**
 * Lectura de PID enriquecida con la metadata del catalogo.
 *
 * Se deriva de las llamadas `read_pid` de la sesion para que la UI pueda mostrar
 * nombre, unidad y veredicto sin volver a interrogar al vehiculo.
 */
export const pidObservationSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string().optional(),
  value: z.number(),
  status: z.enum(['ok', 'review']),
})

/**
 * Informe del diagnostico cognitivo.
 *
 * `toolCalls` es la traza completa de lo que el modelo consulto para llegar al
 * veredicto: es lo que hace auditable el diagnostico en vez de una caja negra.
 */
export const cognitiveDiagnosisResultSchema = z.object({
  diagnosis: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  confidence: z.number(),
  recommendations: z.array(z.string()),
  toolCalls: z.array(toolCallTraceSchema),
  pidObservations: z.array(pidObservationSchema),
  sessionId: z.number().int().optional(),
})

/**
 * Resultado crudo de invocar una tool MCP por su nombre.
 *
 * El contenido depende de la tool invocada, asi que se describe como objeto abierto:
 * fingir un schema cerrado seria mentir sobre lo que devuelve.
 */
export const mcpToolResultSchema = z.record(z.unknown())

/**
 * Capacidades disponibles segun la configuracion del despliegue.
 *
 * El diagnostico cognitivo depende de que haya clave de LLM configurada: la UI lo
 * consulta para no ofrecer un boton que no puede funcionar.
 */
export const mcpCapabilitiesSchema = z.object({
  cognitiveDiagnosis: z.boolean(),
})
