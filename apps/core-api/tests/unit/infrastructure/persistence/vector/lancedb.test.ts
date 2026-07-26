import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockConnect, mockTableNames, mockCreateEmptyTable, mockOpenTable } = vi.hoisted(() => ({
  mockConnect: vi.fn(),
  mockTableNames: vi.fn(),
  mockCreateEmptyTable: vi.fn(),
  mockOpenTable: vi.fn(),
}))

vi.mock('@lancedb/lancedb', () => ({
  connect: mockConnect,
}))

import { initLanceDb, ensureTable } from '@/infrastructure/persistence/vector/lancedb.js'

describe('initLanceDb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should connect to a directory and return db with tableNames', async () => {
    mockTableNames.mockResolvedValue(['pids_index', 'dtcs_index'])
    mockConnect.mockResolvedValue({
      tableNames: mockTableNames,
      createEmptyTable: mockCreateEmptyTable,
    })

    const result = await initLanceDb('/tmp/test-lancedb')

    expect(mockConnect).toHaveBeenCalledWith('/tmp/test-lancedb')
    expect(result.db).toBeDefined()
    expect(result.tableNames).toEqual(['pids_index', 'dtcs_index'])
  })

  it('should use default path when no parameter is provided', async () => {
    mockTableNames.mockResolvedValue([])
    mockConnect.mockResolvedValue({
      tableNames: mockTableNames,
      createEmptyTable: mockCreateEmptyTable,
    })

    await initLanceDb()

    expect(mockConnect).toHaveBeenCalledWith('./data/lancedb')
  })
})

describe('ensureTable', () => {
  const mockDb = {
    tableNames: mockTableNames,
    createEmptyTable: mockCreateEmptyTable,
    openTable: mockOpenTable,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a table with string and float32 columns', async () => {
    mockTableNames.mockResolvedValue([])
    mockCreateEmptyTable.mockResolvedValue({ name: 'test_table' })

    const result = await ensureTable(mockDb, 'test_table', [
      { name: 'id', type: 'string' as const },
      { name: 'vector', type: 'float32' as const },
    ])

    expect(mockCreateEmptyTable).toHaveBeenCalledWith('test_table', expect.any(Object))
    expect(result).toBeDefined()
  })

  it('should not error when table already exists (idempotent)', async () => {
    mockTableNames.mockResolvedValue(['test_table'])
    mockOpenTable.mockResolvedValue({ name: 'test_table' })

    const result = await ensureTable(mockDb, 'test_table', [
      { name: 'id', type: 'string' as const },
    ])

    expect(mockCreateEmptyTable).not.toHaveBeenCalled()
    expect(mockOpenTable).toHaveBeenCalledWith('test_table')
    expect(result).toBeDefined()
  })

  it('should throw when column type is not supported', async () => {
    mockTableNames.mockResolvedValue([])

    await expect(
      ensureTable(mockDb, 'test_table', [{ name: 'id', type: 'unsupported_type' as never }]),
    ).rejects.toThrow()
  })

  it('should support all valid column types (string, float32, int32, boolean)', async () => {
    mockTableNames.mockResolvedValue([])
    mockCreateEmptyTable.mockResolvedValue({ name: 'full_table' })

    const result = await ensureTable(mockDb, 'full_table', [
      { name: 'name', type: 'string' as const },
      { name: 'score', type: 'float32' as const },
      { name: 'count', type: 'int32' as const },
      { name: 'active', type: 'boolean' as const },
    ])

    expect(result).toBeDefined()
    expect(mockCreateEmptyTable).toHaveBeenCalledTimes(1)
  })
})
