import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import type { VectorRepository } from './VectorRepository.js'

/** Repositorio de codigos DTC especificos de fabricante, con busqueda por similitud semantica. */
export type DtcVectorRepository = VectorRepository<DtcKnowledgeEntry>
