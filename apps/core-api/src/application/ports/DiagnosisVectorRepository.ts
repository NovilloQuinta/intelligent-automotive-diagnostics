import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import type { VectorRepository } from './VectorRepository.js'

/** Memoria de taller: casos de diagnostico resueltos, con busqueda por sintomas parecidos. */
export type DiagnosisVectorRepository = VectorRepository<DiagnosisKnowledgeEntry>
