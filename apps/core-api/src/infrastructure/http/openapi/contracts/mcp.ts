import { z } from 'zod'

/**
 * Contratos de respuesta de la capa MCP: capacidades, invocacion directa de tools y
 * diagnostico cognitivo.
 *
 * Ninguno de estos endpoints estaba documentado antes de generar el spec desde el
 * codigo, pese a ser el nucleo del proyecto.
 */

/** Una herramienta invocada por el LLM durante la sesion, con sus argumentos y su salida. */
export const toolCallTraceSchema = z
  .object({
    tool: z.string().describe('Nombre de la tool MCP invocada, por ejemplo `read_dtc_codes`'),
    args: z.record(z.unknown()).describe('Argumentos con los que el modelo la invoco'),
    result: z.string().describe('Salida de la tool, tal cual la recibio el modelo'),
  })
  .describe('Una llamada a tool del LLM. La traza completa es lo que hace auditable el veredicto')

/**
 * Lectura de PID enriquecida con la metadata del catalogo.
 *
 * Se deriva de las llamadas `read_pid` de la sesion para que la UI pueda mostrar
 * nombre, unidad y veredicto sin volver a interrogar al vehiculo.
 */
export const pidObservationSchema = z
  .object({
    code: z.string().describe('Codigo del PID en notacion `modo PID`, por ejemplo `01 0C`'),
    name: z.string().describe('Nombre del parametro segun el catalogo'),
    unit: z.string().optional().describe('Unidad de medida. Ausente en los PID adimensionales'),
    value: z.number().describe('Valor leido, ya aplicada la formula de conversion'),
    status: z
      .enum(['ok', 'review'])
      .describe('`review` cuando el valor cae fuera del rango normal del parametro'),
  })
  .describe('Lectura de un PID enriquecida con la metadata del catalogo')

/**
 * Informe del diagnostico cognitivo.
 *
 * `toolCalls` es la traza completa de lo que el modelo consulto para llegar al
 * veredicto: es lo que hace auditable el diagnostico en vez de una caja negra.
 */
export const cognitiveDiagnosisResultSchema = z
  .object({
    diagnosis: z.string().describe('Veredicto en lenguaje natural, redactado por el modelo'),
    severity: z
      .enum(['low', 'medium', 'high', 'critical'])
      .describe('Gravedad estimada. `critical` desaconseja circular'),
    confidence: z.number().describe('Confianza del modelo en su propio veredicto, de 0 a 1'),
    recommendations: z.array(z.string()).describe('Acciones propuestas, en orden de prioridad'),
    toolCalls: z
      .array(toolCallTraceSchema)
      .describe('Traza completa de lo que el modelo consulto para llegar al veredicto'),
    pidObservations: z
      .array(pidObservationSchema)
      .describe('Lecturas de PID de la sesion, con nombre y unidad resueltos'),
    sessionId: z
      .number()
      .int()
      .optional()
      .describe('Sesion de diagnostico persistida. Ausente si no se llego a guardar'),
  })
  .describe('Informe del diagnostico cognitivo, con la traza de razonamiento del modelo')

/**
 * Resultado crudo de invocar una tool MCP por su nombre.
 *
 * El contenido depende de la tool invocada, asi que se describe como objeto abierto:
 * fingir un schema cerrado seria mentir sobre lo que devuelve.
 */
export const mcpToolResultSchema = z
  .record(z.unknown())
  .describe('Salida cruda de una tool MCP. La forma depende de la tool invocada')

/**
 * Capacidades disponibles segun la configuracion del despliegue.
 *
 * El diagnostico cognitivo depende de que haya clave de LLM configurada: la UI lo
 * consulta para no ofrecer un boton que no puede funcionar.
 */
export const mcpCapabilitiesSchema = z
  .object({
    cognitiveDiagnosis: z
      .boolean()
      .describe('`false` si el despliegue no tiene clave de LLM: la UI oculta el boton'),
  })
  .describe('Capacidades activas segun la configuracion del despliegue')
