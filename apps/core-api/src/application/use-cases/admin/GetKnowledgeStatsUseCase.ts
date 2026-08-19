import type { VectorStorePort } from '@/application/ports/VectorStorePort.js'
import type {
  KnowledgeIndexSummary,
  KnowledgeStats,
} from '@/application/dto/admin/KnowledgeStats.js'

/** Numero de filas de muestra por indice cuando el caller no especifica otro. */
const DEFAULT_SAMPLE_LIMIT = 5

/** Los tres almacenes vectoriales del catalogo (ADR-007 §3), directamente como {@link VectorStorePort}. */
export interface KnowledgeVectorStores {
  readonly pids: VectorStorePort
  readonly dtcs: VectorStorePort
  readonly diagnoses: VectorStorePort
}

/**
 * Caso de uso: combina `count()`/`sample()` de los tres indices del catalogo vectorial en
 * un unico resumen para el panel de administracion.
 */
export class GetKnowledgeStatsUseCase {
  constructor(
    private readonly stores: KnowledgeVectorStores,
    private readonly sampleLimit: number = DEFAULT_SAMPLE_LIMIT,
  ) {}

  async execute(): Promise<KnowledgeStats> {
    const [pids, dtcs, diagnoses] = await Promise.all([
      this.summarize(this.stores.pids),
      this.summarize(this.stores.dtcs),
      this.summarize(this.stores.diagnoses),
    ])

    return { pids, dtcs, diagnoses }
  }

  private async summarize(store: VectorStorePort): Promise<KnowledgeIndexSummary> {
    const [count, sample] = await Promise.all([store.count(), store.sample(this.sampleLimit)])
    return { count, sample }
  }
}
