import { z } from 'zod'

/**
 * Contratos de respuesta de los endpoints de diagnostico.
 *
 * Describen lo que los controladores **proyectan de verdad**, campo a campo. Son la
 * unica fuente de la seccion `components.schemas` del documento OpenAPI: no hay copia
 * escrita a mano que pueda desincronizarse.
 *
 * @see DiagnosisController — origen de las proyecciones
 */

/** Lectura instantanea de los cuatro PID que alimentan los gauges del dashboard. */
export const liveDataSchema = z.object({
  rpm: z.number(),
  coolantTemp: z.number(),
  speed: z.number(),
  intakeTemp: z.number(),
})

/** PID soportado por el vehiculo conectado, ya resuelto contra el catalogo. */
export const availablePidSchema = z.object({
  code: z.string(),
  name: z.string(),
  unit: z.string(),
})

/** Codigo de diagnostico con su descripcion resuelta. */
export const dtcCodeSchema = z.object({
  code: z.string(),
  description: z.string(),
})

/** Identificacion del vehiculo conectado. */
export const vehicleInfoSchema = z.object({
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  engineType: z.string(),
  vin: z.string(),
})

/** Escenario de simulacion expuesto por `GET /api/scenarios`. */
export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  vehicleType: z.enum(['car', 'motorcycle']),
  connectionType: z.enum(['wifi', 'usb', 'bluetooth']),
  sensorValues: liveDataSchema.optional(),
  dtcConfig: z.array(dtcCodeSchema).optional(),
  vehicleInfo: vehicleInfoSchema,
})

/** Resultado del diagnostico determinista (sin LLM). */
export const diagnosisResultSchema = z.object({
  rawData: z.string(),
  parsedValues: liveDataSchema,
  dtcCodes: z.array(dtcCodeSchema),
  diagnosisText: z.string(),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
})

/** Datos congelados en el momento del fallo (Service 02). */
export const freezeFrameSchema = z.object({
  dtcCode: z.string(),
  pidValues: z.record(z.unknown()),
})

/** ECU descubierta en el bus CAN por functional addressing. */
export const ecuInfoSchema = z.object({
  id: z.number(),
  vehicleId: z.number(),
  name: z.string(),
  requestAddr: z.string(),
  responseAddr: z.string(),
  type: z.string(),
  protocol: z.string(),
  discoveredAt: z.string(),
})

/**
 * Resumen de sesion del listado de historial.
 *
 * Coincide campo a campo con la proyeccion de `DiagnosisController.listHistory`, que
 * omite `resultJson` a proposito para no cargar el listado con el informe entero.
 */
export const diagnosisSessionSummarySchema = z.object({
  id: z.number().int(),
  vehicleId: z.number().int().nullable(),
  scenarioId: z.string().nullable(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).nullable(),
  dtcCount: z.number().int().nullable(),
})

/** Detalle de sesion: el resumen mas el snapshot inmutable del informe. */
export const diagnosisSessionDetailSchema = diagnosisSessionSummarySchema.extend({
  resultJson: z.string().nullable(),
})

/** Pagina del historial de diagnosticos del usuario autenticado. */
export const diagnosisSessionListSchema = z.object({
  items: z.array(diagnosisSessionSummarySchema),
  total: z.number().int(),
})

/**
 * Envoltorios de respuesta.
 *
 * Varios endpoints no devuelven la entidad pelada sino un objeto con una sola clave.
 * Se declaran aparte para que el documento describa lo que sale por el cable, no lo
 * que uno esperaria que saliera.
 */

/** `GET /api/scenarios`. */
export const scenarioListSchema = z.object({
  scenarios: z.array(scenarioSchema),
})

/** `GET /api/available-pids`. */
export const availablePidsResponseSchema = z.object({
  pids: z.array(availablePidSchema),
})

/** `GET /api/ecu-info`. */
export const ecuInfoResponseSchema = z.object({
  ecus: z.array(ecuInfoSchema),
})

/** `GET /api/pending-dtc` y `GET /api/permanent-dtc`. */
export const dtcCodesResponseSchema = z.object({
  dtcCodes: z.array(dtcCodeSchema),
})

/** `GET /api/freeze-frame`. */
export const freezeFrameResponseSchema = z.object({
  freezeFrame: freezeFrameSchema,
})

/** `POST /api/clear-dtc` (Service 04, unica escritura del sistema). */
export const clearDtcResponseSchema = z.object({
  cleared: z.boolean(),
})

/**
 * `GET /api/live-data`: los cuatro gauges mas una lectura generica por PID pedido,
 * enriquecida con nombre y unidad del catalogo Mode 01.
 */
export const liveDataResponseSchema = liveDataSchema.extend({
  readings: z.array(
    z.object({
      code: z.string(),
      name: z.string(),
      unit: z.string(),
      value: z.number().nullable(),
    }),
  ),
})

/** `GET /api/vehicle-info`: identificacion mas lo derivado del VIN por la cascada. */
export const vehicleInfoResponseSchema = z.object({
  vin: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  engineType: z.string(),
  manufacturer: z.string().nullable(),
  region: z.object({ country: z.string() }).nullable(),
  modelYearDecoded: z.number().int().nullable(),
})

/** `GET /api/vehicle-status`: luz MIL, recuento de DTC y monitores de emisiones. */
export const vehicleStatusSchema = z.object({
  milOn: z.boolean(),
  dtcCount: z.number().int(),
  engineType: z.enum(['spark', 'compression']),
  monitors: z.array(
    z.object({
      name: z.string(),
      supported: z.boolean(),
      completed: z.boolean(),
    }),
  ),
})

/** Vehiculo persistido, con las ECUs y PIDs aprendidos si se han cargado. */
export const vehicleProfileSchema = z.object({
  id: z.number().int(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  engineType: z.string(),
  vin: z.string(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
})

/**
 * Resultado de confirmar a mano la identidad del vehiculo.
 *
 * `promoted` indica que la marca subio al catalogo de WMI ademas de guardarse en el
 * vehiculo; `conflict` aparece cuando ese WMI ya tenia otra marca, y entonces se
 * conserva la conocida. Los `warnings` son incoherencias que no bloquean.
 */
export const confirmVehicleIdentitySchema = z.object({
  vehicle: vehicleProfileSchema,
  promoted: z.boolean(),
  conflict: z
    .object({
      known: z.string(),
      claimed: z.string(),
    })
    .optional(),
  warnings: z.array(z.string()),
})
