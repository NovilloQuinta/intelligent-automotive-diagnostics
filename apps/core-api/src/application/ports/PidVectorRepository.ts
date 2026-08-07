import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { VectorRepository } from './VectorRepository.js'

/** Repositorio de PIDs propietarios descubiertos, con busqueda por similitud semantica. */
export type PidVectorRepository = VectorRepository<PidKnowledgeEntry>
