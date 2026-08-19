import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import {
  PIDS_TABLE_CONFIG,
  DTCS_TABLE_CONFIG,
  DIAGNOSES_TABLE_CONFIG,
  ECUS_TABLE_CONFIG,
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'
import { createEmbedding } from '@/infrastructure/persistence/vector/embedding.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import { toEcuMetadata, toEcuEntry } from '@/application/knowledge/ecuKnowledgeMapper.js'
import type { EmbeddingGenerator } from '@/application/ports/EmbeddingGenerator.js'
import type { KnowledgeStack } from '@/application/ports/KnowledgeStack.js'
import type { KnowledgeVectorStores } from '@/application/use-cases/admin/GetKnowledgeStatsUseCase.js'
import type { VectorStore } from '@/application/ports/VectorStore.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'
import type { AppConfig } from '@/infrastructure/configuration/index.js'

/** Composicion del catalogo auto-expansivo: base vectorial y sus cuatro indices. */

/**
 * {@link KnowledgeStack} ampliado con los tres {@link VectorStore} crudos, para el panel de
 * administracion (`GetKnowledgeStatsUseCase.count()`/`sample()`). Extiende `KnowledgeStack`
 * (no lo sustituye) para que sigua siendo asignable donde se espera un `KnowledgeStack`
 * simple (p. ej. `DiagnosisService`).
 *
 * El cuarto indice (`ecusIndex`) se crea aqui pero su store no se expone en `vectorStores`:
 * el panel de administracion sigue listando pids/dtcs/diagnoses (fuera del alcance de este
 * cambio).
 */
export interface KnowledgeStackWithStores extends KnowledgeStack {
  readonly vectorStores: KnowledgeVectorStores
}

/** Inicializa la base vectorial y los cuatro indices de conocimiento. */
export async function createKnowledgeStack(
  config: AppConfig,
  logger: LoggerPort,
): Promise<KnowledgeStackWithStores | undefined> {
  try {
    const { db } = await initLanceDb(config.LANCEDB_PATH)
    const [pidsStore, dtcsStore, diagnosesStore, ecusStore] = await Promise.all([
      createLanceVectorStore(db, PIDS_TABLE_CONFIG),
      createLanceVectorStore(db, DTCS_TABLE_CONFIG),
      createLanceVectorStore(db, DIAGNOSES_TABLE_CONFIG),
      createLanceVectorStore(db, ECUS_TABLE_CONFIG),
    ])
    return buildKnowledgeIndexes({ pidsStore, dtcsStore, diagnosesStore, ecusStore })
  } catch (err) {
    logger.warn('RAG knowledge stack unavailable, continuing without it', { err: String(err) })
    return undefined
  }
}

/** Los cuatro almacenes vectoriales ya abiertos, listos para envolverse en indices. */
export interface KnowledgeStores {
  readonly pidsStore: VectorStore
  readonly dtcsStore: VectorStore
  readonly diagnosesStore: VectorStore
  readonly ecusStore: VectorStore
}

/**
 * Envuelve cada almacen en su indice con el par de mappers que le corresponde.
 *
 * Lista declarativa: los cuatro indices comparten forma y solo cambian el store y sus
 * dos mappers. Vive aparte de {@link createKnowledgeStack} para que alli quede a la
 * vista lo unico que ramifica, que es el `try/catch` de disponibilidad de LanceDB.
 */
export function buildKnowledgeIndexes(stores: KnowledgeStores): KnowledgeStackWithStores {
  const embed: EmbeddingGenerator = createEmbedding
  const { pidsStore, dtcsStore, diagnosesStore, ecusStore } = stores
  return {
    pidsIndex: createKnowledgeIndex({
      store: pidsStore,
      embed,
      toMetadata: toPidMetadata,
      fromMetadata: toPidEntry,
    }),
    dtcsIndex: createKnowledgeIndex({
      store: dtcsStore,
      embed,
      toMetadata: toDtcMetadata,
      fromMetadata: toDtcEntry,
    }),
    diagnosisIndex: createKnowledgeIndex({
      store: diagnosesStore,
      embed,
      toMetadata: toDiagnosisMetadata,
      fromMetadata: toDiagnosisEntry,
    }),
    ecusIndex: createKnowledgeIndex({
      store: ecusStore,
      embed,
      toMetadata: toEcuMetadata,
      fromMetadata: toEcuEntry,
    }),
    vectorStores: { pids: pidsStore, dtcs: dtcsStore, diagnoses: diagnosesStore },
  }
}
