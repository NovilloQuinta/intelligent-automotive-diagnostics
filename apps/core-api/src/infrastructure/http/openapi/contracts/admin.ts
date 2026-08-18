import { z } from 'zod'

/**
 * Contratos de respuesta del panel de administracion y del catalogo de conocimiento.
 *
 * Todas estas rutas cuelgan de `/api/admin` y llegan detras de `requireAdmin`.
 */

/** Recuento de usuarios agrupado por tipo de cuenta y por rol. */
export const adminUserStatsSchema = z.object({
  byUserType: z.record(z.number().int()),
  byRole: z.record(z.number().int()),
})

/** Panel de cabecera: usuarios, errores recientes y trafico HTTP aproximado por ruta. */
export const adminOverviewSchema = z.object({
  userStats: adminUserStatsSchema,
  recentErrorCount: z.number().int(),
  httpRequestsByPathApprox: z.record(z.number().int()),
})

/** Entrada del log de aplicacion. */
export const adminLogEntrySchema = z.object({
  id: z.number().int(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string(),
  context: z.string().nullable(),
  createdAt: z.string(),
})

/** Pagina del log de aplicacion. */
export const adminLogsPageSchema = z.object({
  items: z.array(adminLogEntrySchema),
  total: z.number().int(),
})

/** Entrada de la auditoria HTTP (OWASP A09). */
export const adminAuditLogEntrySchema = z.object({
  id: z.number().int(),
  method: z.string(),
  path: z.string(),
  statusCode: z.number().int(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  userId: z.number().int().nullable(),
  createdAt: z.string(),
})

/** Pagina de la auditoria HTTP. */
export const adminAuditLogsPageSchema = z.object({
  items: z.array(adminAuditLogEntrySchema),
  total: z.number().int(),
})

/** Usuario listado en el panel, con su estado de bloqueo. */
export const adminUserEntrySchema = z.object({
  id: z.number().int(),
  username: z.string(),
  email: z.string(),
  userType: z.enum(['individual', 'workshop']),
  role: z.enum(['user', 'admin']),
  businessName: z.string().nullable(),
  taxId: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
  failedLoginAttempts: z.number().int(),
  lockedUntil: z.string().nullable(),
  isWorkshop: z.boolean(),
  isAdmin: z.boolean(),
})

/** Pagina de usuarios del panel. */
export const adminUsersPageSchema = z.object({
  items: z.array(adminUserEntrySchema),
  total: z.number().int(),
})

/** Resumen de uno de los indices vectoriales: cuantas entradas tiene y una muestra. */
export const knowledgeIndexSummarySchema = z.object({
  count: z.number().int(),
  sample: z.array(z.record(z.unknown())),
})

/** Estado de los tres indices del catalogo auto-expansivo. */
export const knowledgeStatsSchema = z.object({
  pids: knowledgeIndexSummarySchema,
  dtcs: knowledgeIndexSummarySchema,
  diagnoses: knowledgeIndexSummarySchema,
})

/** Resultados de la busqueda semantica, con su distancia vectorial. */
export const knowledgeSearchResponseSchema = z.object({
  results: z.array(
    z.object({
      entry: z.record(z.unknown()),
      distance: z.number(),
    }),
  ),
})
