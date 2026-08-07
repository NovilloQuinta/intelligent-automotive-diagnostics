import type { PidVectorRepository } from './PidVectorRepository.js'
import type { DtcVectorRepository } from './DtcVectorRepository.js'
import type { DiagnosisVectorRepository } from './DiagnosisVectorRepository.js'

/**
 * Los tres indices de conocimiento del catalogo auto-expansivo (ADR-007 §3).
 *
 * Se agrupan porque comparten conexion LanceDB y {@link EmbeddingGenerator} en
 * `composition.ts`. Esta interfaz es un contrato de aplicacion — no un detalle
 * de wiring — y por tanto vive en `application/ports/`, no en `composition.ts`.
 */
export interface KnowledgeStack {
  readonly pidsIndex: PidVectorRepository
  readonly dtcsIndex: DtcVectorRepository
  readonly diagnosisIndex: DiagnosisVectorRepository
}
