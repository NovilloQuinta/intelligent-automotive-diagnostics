import type {
  DiagnosisSessionFilter,
  DiagnosisSessionPage,
  SessionResultSnapshot,
} from '@/application/ports/VehicleRepository.js'
import { eq, and, desc, gte, lte, count } from 'drizzle-orm'
import * as schema from '../schema.js'
import { DiagnosisSession } from '@/domain/entities/DiagnosisSession.js'
import type { SessionSeverity } from '@/domain/entities/DiagnosisSession.js'
import type { DiagnosticsDb } from '../db.js'

/** Acceso a sesiones de diagnostico y sus snapshots. */
export class SessionStore {
  constructor(private readonly db: DiagnosticsDb) {}

  async createSession(session: DiagnosisSession): Promise<DiagnosisSession> {
    const result = await this.db
      .insert(schema.diagnosisSessions)
      .values({
        vehicleId: session.vehicleId as number | null,
        userId: session.userId as number | null,
        scenarioId: session.scenarioId ?? null,
        startedAt: new Date().toISOString(),
      })
      .returning()

    return new DiagnosisSession({
      id: result[0].id,
      vehicleId: session.vehicleId,
      userId: session.userId,
      scenarioId: session.scenarioId,
      startedAt: new Date().toISOString(),
    })
  }

  async endSession(sessionId: number, result?: SessionResultSnapshot): Promise<void> {
    await this.db
      .update(schema.diagnosisSessions)
      .set({ ...(result ? this.resultSet(result) : {}), endedAt: new Date().toISOString() })
      .where(eq(schema.diagnosisSessions.id, sessionId))
  }

  async updateSessionResult(sessionId: number, result: SessionResultSnapshot): Promise<void> {
    // El follow-up no re-cierra la sesión: conserva el endedAt del diagnóstico inicial.
    await this.db
      .update(schema.diagnosisSessions)
      .set(this.resultSet(result))
      .where(eq(schema.diagnosisSessions.id, sessionId))
  }

  /** Columnas del snapshot de resultado compartidas por endSession y updateSessionResult. */
  private resultSet(result: SessionResultSnapshot): {
    resultJson: string
    severity: SessionSeverity
    dtcCount: number
  } {
    return {
      resultJson: result.resultJson,
      severity: result.severity,
      dtcCount: result.dtcCount,
    }
  }

  async findSessions(filter: DiagnosisSessionFilter): Promise<DiagnosisSessionPage> {
    const conditions: ReturnType<typeof and>[] = [
      eq(schema.diagnosisSessions.userId, filter.userId),
    ]

    if (filter.from) {
      conditions.push(gte(schema.diagnosisSessions.startedAt, filter.from))
    }
    if (filter.to) {
      conditions.push(lte(schema.diagnosisSessions.startedAt, filter.to))
    }
    if (filter.scenarioId) {
      conditions.push(eq(schema.diagnosisSessions.scenarioId, filter.scenarioId))
    }
    if (filter.severity) {
      conditions.push(eq(schema.diagnosisSessions.severity, filter.severity))
    }

    const where = and(...conditions)

    const [items, totalResult] = await Promise.all([
      this.db
        .select()
        .from(schema.diagnosisSessions)
        .where(where)
        .orderBy(desc(schema.diagnosisSessions.startedAt))
        .limit(filter.limit)
        .offset(filter.offset),
      this.db.select({ total: count() }).from(schema.diagnosisSessions).where(where),
    ])

    return {
      items: items.map(
        (r) =>
          new DiagnosisSession({
            id: r.id,
            vehicleId: r.vehicleId,
            userId: r.userId,
            scenarioId: r.scenarioId ?? undefined,
            startedAt: r.startedAt,
            endedAt: r.endedAt ?? undefined,
            resultJson: r.resultJson ?? undefined,
            severity: (r.severity as SessionSeverity) ?? undefined,
            dtcCount: r.dtcCount ?? undefined,
          }),
      ),
      total: totalResult[0]?.total ?? 0,
    }
  }

  async findSessionById(id: number, userId: number): Promise<DiagnosisSession | null> {
    const rows = await this.db
      .select()
      .from(schema.diagnosisSessions)
      .where(and(eq(schema.diagnosisSessions.id, id), eq(schema.diagnosisSessions.userId, userId)))
      .limit(1)

    if (rows.length === 0) return null

    const r = rows[0]
    return new DiagnosisSession({
      id: r.id,
      vehicleId: r.vehicleId,
      userId: r.userId,
      scenarioId: r.scenarioId ?? undefined,
      startedAt: r.startedAt,
      endedAt: r.endedAt ?? undefined,
      resultJson: r.resultJson ?? undefined,
      severity: (r.severity as SessionSeverity) ?? undefined,
      dtcCount: r.dtcCount ?? undefined,
    })
  }
}
