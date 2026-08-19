import { z } from 'zod'

/**
 * Contratos de respuesta del panel de administracion y del catalogo de conocimiento.
 *
 * Todas estas rutas cuelgan de `/api/admin` y llegan detras de `requireAdmin`.
 */

/** Recuento de usuarios agrupado por tipo de cuenta y por rol. */
export const adminUserStatsSchema = z
  .object({
    byUserType: z
      .record(z.number().int())
      .describe('Numero de cuentas por tipo: `individual` y `workshop`'),
    byRole: z.record(z.number().int()).describe('Numero de cuentas por rol: `user` y `admin`'),
  })
  .describe('Recuento de usuarios agrupado por tipo de cuenta y por rol')

/** Panel de cabecera: usuarios, errores recientes y trafico HTTP aproximado por ruta. */
export const adminOverviewSchema = z
  .object({
    userStats: adminUserStatsSchema.describe('Recuentos de usuarios por tipo y por rol'),
    recentErrorCount: z.number().int().describe('Entradas de nivel `error` en el log reciente'),
    httpRequestsByPathApprox: z
      .record(z.number().int())
      .describe('Peticiones por ruta segun la auditoria HTTP. Aproximado: solo cubre lo auditado'),
  })
  .describe('Cabecera del panel: usuarios, errores recientes y trafico por ruta')

/** Entrada del log de aplicacion. */
export const adminLogEntrySchema = z
  .object({
    id: z.number().int().describe('Identificador de la entrada'),
    level: z.enum(['debug', 'info', 'warn', 'error']).describe('Nivel de severidad'),
    message: z.string().describe('Mensaje registrado'),
    context: z.string().nullable().describe('Contexto serializado en JSON, o `null`'),
    createdAt: z.string().describe('Momento del registro en ISO 8601'),
  })
  .describe('Entrada del log de aplicacion')

/** Pagina del log de aplicacion. */
export const adminLogsPageSchema = z
  .object({
    items: z.array(adminLogEntrySchema).describe('Entradas de esta pagina'),
    total: z.number().int().describe('Total de entradas que cumplen el filtro, no solo la pagina'),
  })
  .describe('Pagina del log de aplicacion')

/** Entrada de la auditoria HTTP (OWASP A09). */
export const adminAuditLogEntrySchema = z
  .object({
    id: z.number().int().describe('Identificador de la entrada'),
    method: z.string().describe('Metodo HTTP de la peticion'),
    path: z.string().describe('Ruta solicitada'),
    statusCode: z.number().int().describe('Codigo de respuesta devuelto'),
    ip: z.string().nullable().describe('IP de origen, o `null` si no se pudo resolver'),
    userAgent: z.string().nullable().describe('Cabecera `User-Agent`, o `null`'),
    durationMs: z.number().int().nullable().describe('Duracion de la peticion en milisegundos'),
    userId: z.number().int().nullable().describe('Usuario autenticado, o `null` si era anonima'),
    createdAt: z.string().describe('Momento de la peticion en ISO 8601'),
  })
  .describe('Entrada de la auditoria HTTP. Cubre el registro que exige OWASP API9:2023')

/** Pagina de la auditoria HTTP. */
export const adminAuditLogsPageSchema = z
  .object({
    items: z.array(adminAuditLogEntrySchema).describe('Entradas de esta pagina'),
    total: z.number().int().describe('Total de entradas que cumplen el filtro'),
  })
  .describe('Pagina de la auditoria HTTP')

/** Usuario listado en el panel, con su estado de bloqueo. */
export const adminUserEntrySchema = z
  .object({
    id: z.number().int().describe('Identificador interno del usuario'),
    username: z.string().describe('Nombre de usuario, unico'),
    email: z.string().describe('Correo electronico, unico'),
    userType: z.enum(['individual', 'workshop']).describe('Particular o taller'),
    role: z.enum(['user', 'admin']).describe('Rol de autorizacion'),
    businessName: z.string().nullable().describe('Razon social. Solo talleres'),
    taxId: z.string().nullable().describe('NIF o CIF. Solo talleres'),
    address: z.string().nullable().describe('Direccion fiscal. Solo talleres'),
    createdAt: z.string().describe('Fecha de alta en ISO 8601'),
    failedLoginAttempts: z
      .number()
      .int()
      .describe('Intentos fallidos consecutivos. A los 5 bloquea'),
    lockedUntil: z.string().nullable().describe('Fin del bloqueo en ISO 8601, o `null`'),
    isWorkshop: z.boolean().describe('Derivado de `userType`'),
    isAdmin: z.boolean().describe('Derivado de `role`'),
  })
  .describe('Usuario listado en el panel, con su estado de bloqueo')

/** Pagina de usuarios del panel. */
export const adminUsersPageSchema = z
  .object({
    items: z.array(adminUserEntrySchema).describe('Usuarios de esta pagina'),
    total: z.number().int().describe('Total de usuarios que cumplen el filtro'),
  })
  .describe('Pagina de usuarios del panel')

/** Resumen de uno de los indices vectoriales: cuantas entradas tiene y una muestra. */
export const knowledgeIndexSummarySchema = z
  .object({
    count: z.number().int().describe('Entradas indexadas'),
    sample: z
      .array(z.record(z.unknown()))
      .describe('Muestra de entradas, para ver que se esta aprendiendo sin volcar el indice'),
  })
  .describe('Resumen de un indice vectorial: cuantas entradas tiene y una muestra')

/** Estado de los tres indices del catalogo auto-expansivo. */
export const knowledgeStatsSchema = z
  .object({
    pids: knowledgeIndexSummarySchema.describe('Indice de PIDs propietarios aprendidos'),
    dtcs: knowledgeIndexSummarySchema.describe('Indice de codigos de averia aprendidos'),
    diagnoses: knowledgeIndexSummarySchema.describe('Indice de diagnosticos previos'),
  })
  .describe('Estado de los indices del catalogo auto-expansivo')

/** Resultados de la busqueda semantica, con su distancia vectorial. */
export const knowledgeSearchResponseSchema = z
  .object({
    results: z
      .array(
        z.object({
          entry: z.record(z.unknown()).describe('Entrada del catalogo que ha casado'),
          distance: z.number().describe('Distancia vectorial. Cuanto menor, mas parecida'),
        }),
      )
      .describe('Coincidencias ordenadas de mas a menos parecida'),
  })
  .describe('Resultados de la busqueda semantica sobre el catalogo')
