import type { OperationSpec } from '../registry.js'

/**
 * Operaciones de la capa MCP. Acompanan a `diagnosis.routes.ts`, donde estan montadas.
 *
 * Ninguna de las tres estaba documentada antes de generar el spec desde el codigo,
 * pese a ser el nucleo del proyecto.
 */
export const mcpOperations: readonly OperationSpec[] = [
  {
    method: 'get',
    path: '/api/mcp/capabilities',
    tag: 'MCP',
    summary: 'Capacidades disponibles segun la configuracion',
    description:
      'El diagnostico cognitivo requiere clave de LLM configurada. La UI lo consulta para no ' +
      'ofrecer un boton que no puede funcionar.',
    auth: true,
    responses: {
      '200': { description: 'Capacidades', schema: 'McpCapabilities' },
      '401': { description: 'Falta el token o no es valido' },
    },
  },
  {
    method: 'post',
    path: '/api/mcp/tools/{toolName}',
    tag: 'MCP',
    summary: 'Invocar una tool MCP por su nombre',
    description:
      'Acceso directo a las 16 tools que el servidor MCP expone al LLM, sin pasar por el ' +
      'agente. Tres familias: diagnostico OBD (`read_pid`, `get_dtc_codes`, `get_freeze_frame`, ' +
      '`read_vin`, `get_vehicle_info`, `get_available_pids`, `get_ecu_info`), conocimiento ' +
      '(`search_similar_pids`, `search_similar_dtcs`, `search_similar_diagnoses`, ' +
      '`search_similar_ecus`, `index_pid`, `index_dtc`, `index_diagnosis`, `index_ecu`) y ' +
      'busqueda web (`web_search`). Las de conocimiento y la web solo estan si hay indice ' +
      'vectorial y proveedor de busqueda configurados. `read_pid` valida el modo OBD contra la ' +
      'allowlist de solo lectura antes de tocar el bus.',
    auth: true,
    requestBody: 'McpToolRequest',
    parameters: [
      {
        name: 'toolName',
        in: 'path',
        required: true,
        description: 'Nombre de la tool a invocar',
        example: 'read_dtc_codes',
        schema: { type: 'string' },
      },
    ],
    responses: {
      '200': { description: 'Resultado de la tool', schema: 'McpToolResult' },
      '400': { description: 'Cuerpo o nombre de tool invalidos' },
      '404': { description: 'La tool no existe' },
      '401': { description: 'Falta el token o no es valido' },
      '429': { description: 'Limite de peticiones superado' },
    },
  },
  {
    method: 'post',
    path: '/api/mcp/cognitive-diagnosis',
    tag: 'MCP',
    summary: 'Diagnostico cognitivo con LLM',
    description:
      'El endpoint central del sistema. El flujo: se recupera contexto del catalogo vectorial ' +
      '(RAG) con los sintomas y el vehiculo; se arma el system prompt con ese contexto y las ' +
      'instrucciones de ambito y seguridad; el modelo decide por su cuenta que tools llamar y ' +
      'en que orden, interrogando al vehiculo y al catalogo hasta tener criterio; y la ' +
      'respuesta se parsea y se enriquece con la metadata de los PID leidos.\n\n' +
      'Lo que devuelve incluye `toolCalls`, la traza completa de lo que el modelo consulto ' +
      'para llegar al veredicto: es lo que hace el diagnostico auditable en vez de una caja ' +
      'negra. Lleva el rate limit mas estricto de la API por ser la operacion mas cara.',
    auth: true,
    requestBody: 'CognitiveDiagnosisRequest',
    responses: {
      '200': { description: 'Informe cognitivo', schema: 'CognitiveDiagnosisResult' },
      '400': { description: 'Cuerpo invalido' },
      '404': { description: 'Escenario o sesion inexistentes' },
      '503': { description: 'Diagnostico cognitivo no disponible: falta configurar el LLM' },
      '504': { description: 'El modelo no respondio a tiempo' },
      '401': { description: 'Falta el token o no es valido' },
      '429': { description: 'Limite de peticiones superado' },
    },
  },
]
