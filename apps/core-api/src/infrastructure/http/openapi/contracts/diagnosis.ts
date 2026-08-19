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
export const liveDataSchema = z
  .object({
    rpm: z.number().describe('Regimen del motor en rpm (PID 01 0C)'),
    coolantTemp: z.number().describe('Temperatura del refrigerante en grados C (PID 01 05)'),
    speed: z.number().describe('Velocidad del vehiculo en km/h (PID 01 0D)'),
    intakeTemp: z.number().describe('Temperatura del aire de admision en grados C (PID 01 0F)'),
  })
  .describe('Lectura instantanea de los cuatro PID que alimentan los gauges del dashboard')

/** PID soportado por el vehiculo conectado, ya resuelto contra el catalogo. */
export const availablePidSchema = z
  .object({
    code: z.string().describe('Codigo del PID en notacion `modo PID`, por ejemplo `01 0C`'),
    name: z.string().describe('Nombre del parametro segun el catalogo SAE J1979'),
    unit: z.string().describe('Unidad de medida del valor'),
  })
  .describe('PID soportado por el vehiculo, ya resuelto contra el catalogo')

/** Codigo de diagnostico con su descripcion resuelta. */
export const dtcCodeSchema = z
  .object({
    code: z.string().describe('Codigo DTC normalizado, por ejemplo `P0301`'),
    description: z.string().describe('Descripcion resuelta contra el catalogo de averias'),
  })
  .describe('Codigo de averia con su descripcion resuelta')

/** Identificacion del vehiculo conectado. */
export const vehicleInfoSchema = z
  .object({
    make: z.string().describe('Marca del vehiculo'),
    model: z.string().describe('Modelo'),
    year: z.number().int().describe('Ano de fabricacion'),
    engineType: z.string().describe('Motorizacion, por ejemplo `2.0 TDI`'),
    vin: z.string().describe('Numero de bastidor, 17 caracteres'),
  })
  .describe('Identificacion del vehiculo conectado')

/** Escenario de simulacion expuesto por `GET /api/scenarios`. */
export const scenarioSchema = z
  .object({
    id: z.string().describe('Identificador del escenario, el que se pasa como `scenarioId`'),
    name: z.string().describe('Nombre legible para la lista de la UI'),
    vehicleType: z.enum(['car', 'motorcycle']).describe('Coche o moto'),
    connectionType: z
      .enum(['wifi', 'usb', 'bluetooth'])
      .describe('Como se llega al adaptador ELM327'),
    sensorValues: liveDataSchema
      .optional()
      .describe('Telemetria fija del escenario. Ausente si la sirve el emulador en vivo'),
    dtcConfig: z
      .array(dtcCodeSchema)
      .optional()
      .describe('Averias fijas del escenario. Ausente si las sirve el emulador en vivo'),
    vehicleInfo: vehicleInfoSchema.describe('Identificacion del vehiculo emulado'),
  })
  .describe('Vehiculo emulado disponible para la demo')

/** Resultado del diagnostico determinista (sin LLM). */
export const diagnosisResultSchema = z
  .object({
    rawData: z.string().describe('Respuesta cruda del ELM327, util para auditar la lectura'),
    parsedValues: liveDataSchema.describe('Telemetria ya interpretada'),
    dtcCodes: z.array(dtcCodeSchema).describe('Averias activas encontradas'),
    diagnosisText: z.string().describe('Veredicto por reglas deterministas, sin LLM'),
    severity: z
      .enum(['low', 'medium', 'high', 'critical'])
      .describe('Gravedad estimada por las mismas reglas'),
  })
  .describe('Resultado del diagnostico determinista, sin intervencion del LLM')

/** Datos congelados en el momento del fallo (Service 02). */
export const freezeFrameSchema = z
  .object({
    dtcCode: z.string().describe('Averia que provoco la congelacion del marco'),
    pidValues: z.record(z.unknown()).describe('Valores de los PID en el instante del fallo'),
  })
  .describe('Marco congelado en el instante del fallo (Service 02)')

/** ECU descubierta en el bus CAN por functional addressing. */
export const ecuInfoSchema = z
  .object({
    id: z.number().describe('Identificador interno de la ECU persistida'),
    vehicleId: z.number().describe('Vehiculo al que pertenece'),
    name: z.string().describe('Nombre de la centralita, o `ECU <addr>` si no se conoce'),
    requestAddr: z.string().describe('Direccion CAN de peticion, por ejemplo `7E0`'),
    responseAddr: z.string().describe('Direccion CAN de respuesta, por ejemplo `7E8`'),
    type: z.string().describe('Tipo de centralita, o `unknown` si el catalogo no la tiene'),
    protocol: z.string().describe('Protocolo del bus, por ejemplo `ISO 15765-4 CAN`'),
    discoveredAt: z.string().describe('Momento del descubrimiento en ISO 8601'),
  })
  .describe('Centralita descubierta en el bus CAN por functional addressing')

/**
 * Resumen de sesion del listado de historial.
 *
 * Coincide campo a campo con la proyeccion de `DiagnosisController.listHistory`, que
 * omite `resultJson` a proposito para no cargar el listado con el informe entero.
 */
export const diagnosisSessionSummarySchema = z
  .object({
    id: z.number().int().describe('Identificador de la sesion'),
    vehicleId: z.number().int().nullable().describe('Vehiculo diagnosticado, o `null`'),
    scenarioId: z.string().nullable().describe('Escenario usado, o `null` si fue un coche real'),
    startedAt: z.string().describe('Inicio de la sesion en ISO 8601'),
    endedAt: z.string().nullable().describe('Fin de la sesion, o `null` si sigue abierta'),
    severity: z
      .enum(['low', 'medium', 'high', 'critical'])
      .nullable()
      .describe('Gravedad del veredicto, o `null` si no llego a emitirse'),
    dtcCount: z.number().int().nullable().describe('Averias encontradas, o `null`'),
  })
  .describe('Resumen de sesion del historial. Omite el informe entero a proposito')

/** Detalle de sesion: el resumen mas el snapshot inmutable del informe. */
export const diagnosisSessionDetailSchema = diagnosisSessionSummarySchema
  .extend({
    resultJson: z
      .string()
      .nullable()
      .describe('Informe completo serializado en JSON. Snapshot inmutable de la sesion'),
  })
  .describe('Detalle de sesion: el resumen mas el informe completo')

/** Pagina del historial de diagnosticos del usuario autenticado. */
export const diagnosisSessionListSchema = z
  .object({
    items: z.array(diagnosisSessionSummarySchema).describe('Sesiones de esta pagina'),
    total: z.number().int().describe('Total de sesiones que cumplen el filtro'),
  })
  .describe('Pagina del historial de diagnosticos del usuario autenticado')

/**
 * Envoltorios de respuesta.
 *
 * Varios endpoints no devuelven la entidad pelada sino un objeto con una sola clave.
 * Se declaran aparte para que el documento describa lo que sale por el cable, no lo
 * que uno esperaria que saliera.
 */

/** `GET /api/scenarios`. */
export const scenarioListSchema = z
  .object({
    scenarios: z.array(scenarioSchema).describe('Vehiculos emulados disponibles'),
  })
  .describe('Respuesta de `GET /api/scenarios`')

/** `GET /api/available-pids`. */
export const availablePidsResponseSchema = z
  .object({
    pids: z.array(availablePidSchema).describe('PIDs que el vehiculo declara soportar'),
  })
  .describe('Respuesta de `GET /api/available-pids`')

/** `GET /api/ecu-info`. */
export const ecuInfoResponseSchema = z
  .object({
    ecus: z.array(ecuInfoSchema).describe('Centralitas descubiertas en el bus'),
  })
  .describe('Respuesta de `GET /api/ecu-info`')

/** `GET /api/pending-dtc` y `GET /api/permanent-dtc`. */
export const dtcCodesResponseSchema = z
  .object({
    dtcCodes: z.array(dtcCodeSchema).describe('Averias encontradas en el modo consultado'),
  })
  .describe('Respuesta de `GET /api/pending-dtc` y `GET /api/permanent-dtc`')

/** `GET /api/freeze-frame`. */
export const freezeFrameResponseSchema = z
  .object({
    freezeFrame: freezeFrameSchema.describe('Marco congelado del primer DTC almacenado'),
  })
  .describe('Respuesta de `GET /api/freeze-frame`')

/** `POST /api/clear-dtc` (Service 04, unica escritura del sistema). */
export const clearDtcResponseSchema = z
  .object({
    cleared: z.boolean().describe('`true` si el borrado se ejecuto en el vehiculo'),
  })
  .describe('Respuesta de `POST /api/clear-dtc`. Es la unica escritura del sistema')

/**
 * `GET /api/live-data`: los cuatro gauges mas una lectura generica por PID pedido,
 * enriquecida con nombre y unidad del catalogo Mode 01.
 */
export const liveDataResponseSchema = liveDataSchema
  .extend({
    readings: z
      .array(
        z.object({
          code: z.string().describe('Codigo del PID leido'),
          name: z.string().describe('Nombre del parametro segun el catalogo'),
          unit: z.string().describe('Unidad de medida'),
          value: z
            .number()
            .nullable()
            .describe('Valor leido, o `null` si el vehiculo no respondio'),
        }),
      )
      .describe('Una lectura por cada PID pedido en `pids`, con su metadata resuelta'),
  })
  .describe('Respuesta de `GET /api/live-data`: los cuatro gauges mas los PID pedidos')

/** `GET /api/vehicle-info`: identificacion mas lo derivado del VIN por la cascada. */
export const vehicleInfoResponseSchema = z
  .object({
    vin: z.string().describe('Numero de bastidor leido del vehiculo (Mode 09 PID 02)'),
    make: z.string().describe('Marca resuelta por la cascada de identificacion'),
    model: z.string().describe('Modelo'),
    year: z.number().int().describe('Ano de fabricacion'),
    engineType: z.string().describe('Motorizacion'),
    manufacturer: z
      .string()
      .nullable()
      .describe('Fabricante segun el WMI del VIN, o `null` si no esta en el catalogo'),
    region: z
      .object({ country: z.string().describe('Pais de fabricacion') })
      .nullable()
      .describe('Origen decodificado del WMI, o `null` si no se pudo determinar'),
    modelYearDecoded: z
      .number()
      .int()
      .nullable()
      .describe('Ano decodificado del decimo caracter del VIN, o `null`'),
  })
  .describe('Respuesta de `GET /api/vehicle-info`: identificacion mas lo derivado del VIN')

/** `GET /api/vehicle-status`: luz MIL, recuento de DTC y monitores de emisiones. */
export const vehicleStatusSchema = z
  .object({
    milOn: z.boolean().describe('`true` si la luz de averia del cuadro esta encendida'),
    dtcCount: z.number().int().describe('Averias almacenadas segun el propio vehiculo'),
    engineType: z.enum(['spark', 'compression']).describe('Gasolina o diesel, segun el PID 01 01'),
    monitors: z
      .array(
        z.object({
          name: z.string().describe('Nombre del monitor de emisiones'),
          supported: z.boolean().describe('`true` si el vehiculo implementa este monitor'),
          completed: z.boolean().describe('`true` si el monitor ha terminado su ciclo'),
        }),
      )
      .describe('Monitores de emisiones. Son los que decide una ITV'),
  })
  .describe('Respuesta de `GET /api/vehicle-status`: luz MIL, DTC y monitores de emisiones')

/** Vehiculo persistido, con las ECUs y PIDs aprendidos si se han cargado. */
export const vehicleProfileSchema = z
  .object({
    id: z.number().int().describe('Identificador interno del vehiculo'),
    make: z.string().describe('Marca'),
    model: z.string().describe('Modelo'),
    year: z.number().int().describe('Ano de fabricacion'),
    engineType: z.string().describe('Motorizacion'),
    vin: z.string().describe('Numero de bastidor, clave natural del vehiculo'),
    firstSeen: z.string().optional().describe('Primera conexion en ISO 8601'),
    lastSeen: z.string().optional().describe('Ultima conexion en ISO 8601'),
  })
  .describe('Vehiculo persistido en el catalogo')

/**
 * Resultado de confirmar a mano la identidad del vehiculo.
 *
 * `promoted` indica que la marca subio al catalogo de WMI ademas de guardarse en el
 * vehiculo; `conflict` aparece cuando ese WMI ya tenia otra marca, y entonces se
 * conserva la conocida. Los `warnings` son incoherencias que no bloquean.
 */
export const confirmVehicleIdentitySchema = z
  .object({
    vehicle: vehicleProfileSchema.describe('Vehiculo ya con la identidad confirmada'),
    promoted: z
      .boolean()
      .describe('`true` si la marca subio al catalogo de WMI, y no solo a este vehiculo'),
    conflict: z
      .object({
        known: z.string().describe('Marca que el catalogo ya tenia para ese WMI'),
        claimed: z.string().describe('Marca que declaro el usuario'),
      })
      .optional()
      .describe('Presente si ese WMI ya tenia otra marca. Se conserva la conocida'),
    warnings: z.array(z.string()).describe('Incoherencias detectadas que no bloquean el guardado'),
  })
  .describe('Resultado de confirmar a mano la identidad del vehiculo')
