import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mocks must be before any imports that use the mocked modules.
vi.mock('@/infrastructure/persistence/vector/lancedb.js', () => ({
  initLanceDb: vi.fn(),
}))

vi.mock('@/infrastructure/persistence/vector/lanceVectorStore.js', () => ({
  createLanceVectorStore: vi.fn(),
}))

vi.mock('@/infrastructure/persistence/vector/embedding.js', () => ({
  createEmbedding: vi.fn(),
}))

import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import { createEmbedding } from '@/infrastructure/persistence/vector/embedding.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

// We will import createKnowledgeStack via buildApp indirectly, or export it for direct testing.
// For now, the function does not exist yet — test will fail (RED).

function createMockLogger(): LoggerPort {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

/** Minimal mock of a LanceDB connection. */
function mockLanceDb() {
  return {
    db: {
      tableNames: vi.fn().mockResolvedValue([]),
      createEmptyTable: vi.fn(),
      openTable: vi.fn(),
    },
    tableNames: [] as string[],
  }
}

/** Minimal mock of a vector store with upsert/query. */
function mockVectorStore() {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
  }
}

describe('createKnowledgeStack', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create four knowledge indices from LanceDB configs', { timeout: 15000 }, async () => {
    // Dynamically import after mocks are set up
    const { createKnowledgeStack } = await import('@/infrastructure/composition/composition.js')

    const lanceDb = mockLanceDb()
    vi.mocked(initLanceDb).mockResolvedValue(lanceDb)
    vi.mocked(createLanceVectorStore).mockResolvedValue(mockVectorStore())
    vi.mocked(createEmbedding).mockResolvedValue([0.1, 0.2, 0.3])
    const logger = createMockLogger()

    const stack = await createKnowledgeStack(
      { LANCEDB_PATH: '/tmp/test-lancedb' } as Parameters<typeof createKnowledgeStack>[0],
      logger,
    )

    expect(stack).toBeDefined()
    expect(stack).not.toBeUndefined()
    expect(stack!.pidsIndex).toBeDefined()
    expect(stack!.dtcsIndex).toBeDefined()
    expect(stack!.diagnosisIndex).toBeDefined()
    expect(stack!.ecusIndex).toBeDefined()
    expect(initLanceDb).toHaveBeenCalledWith('/tmp/test-lancedb')
    expect(createLanceVectorStore).toHaveBeenCalledTimes(4)
  })

  it('should also expose the three raw vector stores for admin stats (count/sample)', async () => {
    const { createKnowledgeStack } = await import('@/infrastructure/composition/composition.js')

    const lanceDb = mockLanceDb()
    vi.mocked(initLanceDb).mockResolvedValue(lanceDb)
    const pidsStore = mockVectorStore()
    const dtcsStore = mockVectorStore()
    const diagnosesStore = mockVectorStore()
    const ecusStore = mockVectorStore()
    vi.mocked(createLanceVectorStore)
      .mockResolvedValueOnce(pidsStore)
      .mockResolvedValueOnce(dtcsStore)
      .mockResolvedValueOnce(diagnosesStore)
      .mockResolvedValueOnce(ecusStore)
    vi.mocked(createEmbedding).mockResolvedValue([0.1, 0.2, 0.3])
    const logger = createMockLogger()

    const stack = await createKnowledgeStack(
      { LANCEDB_PATH: '/tmp/test-lancedb' } as Parameters<typeof createKnowledgeStack>[0],
      logger,
    )

    expect(stack!.vectorStores.pids).toBe(pidsStore)
    expect(stack!.vectorStores.dtcs).toBe(dtcsStore)
    expect(stack!.vectorStores.diagnoses).toBe(diagnosesStore)
  })

  it('should return undefined when initLanceDb throws', async () => {
    const { createKnowledgeStack } = await import('@/infrastructure/composition/composition.js')

    vi.mocked(initLanceDb).mockRejectedValue(new Error('LanceDB unavailable'))
    const logger = createMockLogger()

    const stack = await createKnowledgeStack(
      { LANCEDB_PATH: '/tmp/test-lancedb' } as Parameters<typeof createKnowledgeStack>[0],
      logger,
    )

    expect(stack).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })

  it('should return undefined when createLanceVectorStore throws', async () => {
    const { createKnowledgeStack } = await import('@/infrastructure/composition/composition.js')

    vi.mocked(initLanceDb).mockResolvedValue(mockLanceDb())
    vi.mocked(createLanceVectorStore).mockRejectedValue(new Error('Table creation failed'))
    const logger = createMockLogger()

    const stack = await createKnowledgeStack(
      { LANCEDB_PATH: '/tmp/test-lancedb' } as Parameters<typeof createKnowledgeStack>[0],
      logger,
    )

    expect(stack).toBeUndefined()
    expect(logger.warn).toHaveBeenCalledTimes(1)
  })
})
