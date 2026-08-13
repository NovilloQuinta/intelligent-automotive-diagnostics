import type { EcuKnowledgeEntry } from '@/application/dto/knowledge/EcuKnowledgeEntry.js'
import type { VectorRepository } from './VectorRepository.js'

/** Repositorio de definiciones de ECU aprendidas, con busqueda por similitud semantica. */
export type EcuVectorRepository = VectorRepository<EcuKnowledgeEntry>
