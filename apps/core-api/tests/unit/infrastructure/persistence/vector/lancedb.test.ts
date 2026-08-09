import { describe, it, expect, beforeEach, vi } from 'vitest'
import { Bool, Float32, Int32, Utf8 } from 'apache-arrow'
import type { Schema } from 'apache-arrow'

const { mockConnect, mockTableNames, mockCreateEmptyTable, mockOpenTable, mockDropTable } =
  vi.hoisted(() => ({
    mockConnect: vi.fn(),
    mockTableNames: vi.fn(),
    mockCreateEmptyTable: vi.fn(),
    mockOpenTable: vi.fn(),
    mockDropTable: vi.fn(),
  }))

vi.mock('@lancedb/lancedb', () => ({
  connect: mockConnect,
}))

import { initLanceDb, ensureVectorTable } from '@/infrastructure/persistence/vector/lancedb.js'

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

describe('ensureVectorTable', () => {
  const mockDb = {
    tableNames: mockTableNames,
    createEmptyTable: mockCreateEmptyTable,
    openTable: mockOpenTable,
    dropTable: mockDropTable,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('coloca la columna vector primero y mapea los metadatos a clases Arrow', async () => {
    mockTableNames.mockResolvedValue([])
    mockCreateEmptyTable.mockResolvedValue({ name: 'test_table' })

    await ensureVectorTable(mockDb, 'test_table', {
      dimensions: 384,
      columns: [
        { name: 'name', type: 'string' },
        { name: 'score', type: 'float32' },
        { name: 'count', type: 'int32' },
        { name: 'active', type: 'boolean' },
      ],
    })

    // Se afirma el esquema real, no `expect.any(Object)`: esa asercion laxa dejo pasar
    // que `string` no era un nombre de tipo valido para LanceDB.
    const [tableName, schema] = mockCreateEmptyTable.mock.calls[0] as [string, Schema]
    expect(tableName).toBe('test_table')
    expect(schema.fields.map((f) => f.name)).toEqual(['vector', 'name', 'score', 'count', 'active'])
    expect(schema.fields.slice(1).map((f) => f.type.constructor)).toEqual([
      Utf8,
      Float32,
      Int32,
      Bool,
    ])
  })

  it('reabre la tabla existente sin recrearla (idempotencia)', async () => {
    mockTableNames.mockResolvedValue(['test_table'])
    mockOpenTable.mockResolvedValue({
      name: 'test_table',
      schema: vi.fn().mockResolvedValue({
        fields: [{ name: 'vector' }, { name: 'id' }],
      }),
    })

    const result = await ensureVectorTable(mockDb, 'test_table', {
      dimensions: 384,
      columns: [{ name: 'id', type: 'string' }],
    })

    expect(mockDropTable).not.toHaveBeenCalled()
    expect(mockCreateEmptyTable).not.toHaveBeenCalled()
    expect(mockOpenTable).toHaveBeenCalledWith('test_table')
    expect(result).toBeDefined()
  })

  it('rechaza un tipo de columna no soportado', async () => {
    mockTableNames.mockResolvedValue([])

    await expect(
      ensureVectorTable(mockDb, 'test_table', {
        dimensions: 384,
        columns: [{ name: 'id', type: 'unsupported_type' as never }],
      }),
    ).rejects.toThrow()
  })
})
