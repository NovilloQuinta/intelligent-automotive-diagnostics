import type { OperationSpec } from '../registry.js'

/** Respuestas comunes a todo endpoint autenticado de diagnostico. */
const AUTH_ERRORS = {
  '401': { description: 'Falta el token o no es valido' },
  '429': { description: 'Limite de peticiones superado' },
} as const

/** Operaciones de diagnostico OBD-II. Acompanan a `diagnosis.routes.ts`. */
export const diagnosisOperations: readonly OperationSpec[] = [
  {
    method: 'get',
    path: '/api/scenarios',
    tag: 'Diagnosis',
    summary: 'Escenarios de simulacion disponibles',
    description: 'Los tres vehiculos emulados: Audi A3 TDI, Kawasaki Z900 y Toyota Auris Hybrid.',
    auth: true,
    responses: { '200': { description: 'Escenarios', schema: 'ScenarioList' }, ...AUTH_ERRORS },
  },
  {
    method: 'post',
    path: '/api/diagnosis',
    tag: 'Diagnosis',
    summary: 'Diagnostico determinista',
    description: 'Lee PIDs y DTC y aplica reglas, sin intervencion del LLM.',
    auth: true,
    requestBody: 'DiagnosisRequest',
    responses: {
      '200': { description: 'Informe', schema: 'DiagnosisResult' },
      '400': { description: 'Cuerpo invalido' },
      '404': { description: 'Escenario inexistente' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/live-data',
    tag: 'Diagnosis',
    summary: 'Lectura de PIDs en vivo',
    auth: true,
    responses: { '200': { description: 'Lecturas', schema: 'LiveDataResponse' }, ...AUTH_ERRORS },
  },
  {
    method: 'get',
    path: '/api/available-pids',
    tag: 'Diagnosis',
    summary: 'PIDs soportados por el vehiculo',
    description:
      'Escanea el bitmask de Mode 01 PID 00 y lo cruza con el catalogo. Hoy solo cubre el ' +
      'rango 01-20: encadenar `01 20` y `01 40` esta pendiente.',
    auth: true,
    responses: {
      '200': { description: 'PIDs', schema: 'AvailablePidsResponse' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/vehicle-info',
    tag: 'Diagnosis',
    summary: 'Identificacion del vehiculo',
    description: 'Incluye lo derivado del VIN por la cascada BBDD -> catalogo -> web -> mecanico.',
    auth: true,
    responses: {
      '200': { description: 'Identificacion', schema: 'VehicleInfoResponse' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/vehicle-status',
    tag: 'Diagnosis',
    summary: 'Estado del vehiculo y monitores de emisiones',
    auth: true,
    responses: { '200': { description: 'Estado', schema: 'VehicleStatus' }, ...AUTH_ERRORS },
  },
  {
    method: 'post',
    path: '/api/vehicle-identity',
    tag: 'Diagnosis',
    summary: 'Confirmar a mano la identidad del vehiculo',
    description:
      'Ultimo escalon de la cascada: lo que aporta el mecanico. Si el WMI no se conocia, la ' +
      'marca sube al catalogo y queda aprendida para el proximo vehiculo de ese fabricante.',
    auth: true,
    requestBody: 'VehicleIdentityRequest',
    responses: {
      '200': { description: 'Identidad confirmada', schema: 'ConfirmVehicleIdentity' },
      '400': { description: 'Cuerpo invalido' },
      '404': { description: 'Identificacion no disponible: no hay persistencia configurada' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/freeze-frame',
    tag: 'Diagnosis',
    summary: 'Datos congelados del fallo (Service 02)',
    auth: true,
    responses: {
      '200': { description: 'Freeze frame', schema: 'FreezeFrameResponse' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/pending-dtc',
    tag: 'Diagnosis',
    summary: 'DTC pendientes (Service 07)',
    auth: true,
    responses: { '200': { description: 'Codigos', schema: 'DtcCodesResponse' }, ...AUTH_ERRORS },
  },
  {
    method: 'get',
    path: '/api/permanent-dtc',
    tag: 'Diagnosis',
    summary: 'DTC permanentes (Service 0A)',
    auth: true,
    responses: { '200': { description: 'Codigos', schema: 'DtcCodesResponse' }, ...AUTH_ERRORS },
  },
  {
    method: 'post',
    path: '/api/clear-dtc',
    tag: 'Diagnosis',
    summary: 'Borrar los DTC almacenados (Service 04)',
    description:
      'Unica escritura del sistema y **irreversible en un vehiculo real**: borra codigos y ' +
      'freeze frames y reinicia los monitores de emisiones. Con `OBD_READ_ONLY=true` se rechaza.',
    auth: true,
    responses: {
      '200': { description: 'Codigos borrados', schema: 'ClearDtcResponse' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/ecu-info',
    tag: 'Diagnosis',
    summary: 'ECUs descubiertas en el bus',
    description:
      'Barrido por functional addressing (`AT SH 7DF` + `01 00`): responde cada ECU del bus y ' +
      'se resuelve su direccion contra el catalogo. Es el equivalente al auto-scan de una ' +
      'maquina de taller.',
    auth: true,
    responses: { '200': { description: 'ECUs', schema: 'EcuInfoResponse' }, ...AUTH_ERRORS },
  },
  {
    method: 'get',
    path: '/api/diagnosis-history',
    tag: 'Diagnosis',
    summary: 'Historial de diagnosticos del usuario',
    description: 'Siempre acotado al usuario autenticado. No incluye el informe entero.',
    auth: true,
    parameters: [
      { name: 'from', in: 'query', description: 'Desde (ISO 8601)', schema: { type: 'string' } },
      { name: 'to', in: 'query', description: 'Hasta (ISO 8601)', schema: { type: 'string' } },
      {
        name: 'severity',
        in: 'query',
        description: 'Filtro de severidad',
        schema: { type: 'string' },
      },
      { name: 'limit', in: 'query', description: 'Tamano de pagina', schema: { type: 'integer' } },
      { name: 'offset', in: 'query', description: 'Desplazamiento', schema: { type: 'integer' } },
    ],
    responses: {
      '200': { description: 'Pagina del historial', schema: 'DiagnosisSessionList' },
      '400': { description: 'Filtros invalidos o rango de fechas al reves' },
      ...AUTH_ERRORS,
    },
  },
  {
    method: 'get',
    path: '/api/diagnosis-history/{id}',
    tag: 'Diagnosis',
    summary: 'Detalle de una sesion',
    description:
      'Devuelve el informe congelado. Una sesion de otro usuario responde 404, no 403: ' +
      'confirmar su existencia ya seria filtrar informacion.',
    auth: true,
    parameters: [
      {
        name: 'id',
        in: 'path',
        required: true,
        description: 'Identificador de la sesion',
        schema: { type: 'integer' },
      },
    ],
    responses: {
      '200': { description: 'Sesion', schema: 'DiagnosisSessionDetail' },
      '404': { description: 'No existe o no es del usuario autenticado' },
      ...AUTH_ERRORS,
    },
  },
]
