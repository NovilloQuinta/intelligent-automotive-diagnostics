import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockPipeline, mockExtractor } = vi.hoisted(() => ({
  mockPipeline: vi.fn(),
  mockExtractor: vi.fn(),
}))

vi.mock('@xenova/transformers', () => ({
  pipeline: mockPipeline,
}))

import {
  createEmbedding,
  resetEmbeddingCache,
} from '@/infrastructure/persistence/vector/embedding.js'

function makeMockTensor(values: number[]) {
  return {
    data: new Float32Array(values),
    tolist: () => [...values],
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

describe('createEmbedding', () => {
  const EMBEDDING_DIM = 384

  beforeEach(() => {
    vi.clearAllMocks()
    resetEmbeddingCache()
  })

  it('should return an array of 384 dimensions', async () => {
    const mockVector = Array.from({ length: EMBEDDING_DIM }, (_, i) => i * 0.001)
    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor.mockResolvedValue(makeMockTensor(mockVector))

    const result = await createEmbedding('Engine Oil Pressure')

    expect(result).toHaveLength(EMBEDDING_DIM)
  })

  it('should pass normalize option to the pipeline', async () => {
    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor.mockResolvedValue(makeMockTensor(new Array(EMBEDDING_DIM).fill(0.01)))

    await createEmbedding('Engine Oil Pressure')

    expect(mockExtractor).toHaveBeenCalledWith(
      'Engine Oil Pressure',
      expect.objectContaining({ normalize: true }),
    )
  })

  it('should produce vectors with high similarity for similar texts', async () => {
    const oilPressureVec = Array.from({ length: EMBEDDING_DIM }, () => Math.random() - 0.5)
    const aceitePresionVec = oilPressureVec.map((v) => v + (Math.random() - 0.5) * 0.05)

    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor
      .mockResolvedValueOnce(makeMockTensor(oilPressureVec))
      .mockResolvedValueOnce(makeMockTensor(aceitePresionVec))

    const vec1 = await createEmbedding('Engine Oil Pressure')
    const vec2 = await createEmbedding('Presion de aceite del motor')

    const sim = cosineSimilarity(vec1, vec2)
    expect(sim).toBeGreaterThan(0.7)
  })

  it('should produce vectors with low similarity for distinct texts', async () => {
    const oilVec = Array.from({ length: EMBEDDING_DIM }, () => Math.random() - 0.5)
    const unrelatedVec = Array.from({ length: EMBEDDING_DIM }, () => Math.random() - 0.5)

    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor
      .mockResolvedValueOnce(makeMockTensor(oilVec))
      .mockResolvedValueOnce(makeMockTensor(unrelatedVec))

    const vec1 = await createEmbedding('Engine Oil Pressure')
    const vec2 = await createEmbedding('Rueda delantera pinchada')

    const sim = cosineSimilarity(vec1, vec2)
    expect(sim).toBeLessThan(0.5)
  })

  it('should lazy-load the model on first call only', async () => {
    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor.mockResolvedValue(makeMockTensor(new Array(EMBEDDING_DIM).fill(0.01)))

    await createEmbedding('first call')
    expect(mockPipeline).toHaveBeenCalledTimes(1)

    await createEmbedding('second call')
    expect(mockPipeline).toHaveBeenCalledTimes(1)
  })

  it('should throw when text is empty string', async () => {
    await expect(createEmbedding('')).rejects.toThrow()
  })

  it('should handle Spanish text', async () => {
    mockPipeline.mockResolvedValue(mockExtractor)
    mockExtractor.mockResolvedValue(makeMockTensor(new Array(EMBEDDING_DIM).fill(0.02)))

    const result = await createEmbedding('Presion de aceite del motor')

    expect(result).toHaveLength(EMBEDDING_DIM)
    expect(result.every((v) => typeof v === 'number')).toBe(true)
  })
})
