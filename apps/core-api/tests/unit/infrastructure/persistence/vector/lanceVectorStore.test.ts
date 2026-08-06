import { describe, it, expect, beforeEach, vi } from 'vitest'

const { mockEnsureVectorTable } = vi.hoisted(() => ({ mockEnsureVectorTable: vi.fn() }))

vi.mock('@/infrastructure/persistence/vector/lancedb.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/infrastructure/persistence/vector/lancedb.js')>()),
  ensureVectorTable: mockEnsureVectorTable,
}))

import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import type { LanceVectorStoreConfig } from '@/infrastructure/persistence/vector/lanceVectorStore.js'

const CONFIG: LanceVectorStoreConfig = {
  table: 'test_index',
  dimensions: 3,
  columns: [
    { name: 'id', type: 'string' },
    { name: 'manufacturer', type: 'string' },
  ],
}

function makeTable(rows: Record<string, unknown>[] = []) {
  const query = {
    limit: vi.fn(() => query),
    where: vi.fn(() => query),
    toArray: vi.fn().mockResolvedValue(rows),
  }
  return { add: vi.fn().mockResolvedValue(undefined), search: vi.fn(() => query), query }
}

async function makeStore(rows: Record<string, unknown>[] = []) {
  const table = makeTable(rows)
  mockEnsureVectorTable.mockResolvedValue(table)
  const store = await createLanceVectorStore({} as never, CONFIG)
  return { store, table }
}

describe('createLanceVectorStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('aprovisiona la tabla con las dimensiones y columnas configuradas', async () => {
    await makeStore()

    expect(mockEnsureVectorTable).toHaveBeenCalledWith({}, 'test_index', {
      dimensions: 3,
      columns: CONFIG.columns,
    })
  })

  describe('upsert', () => {
    it('inserta el vector en su columna junto a los metadatos', async () => {
      const { store, table } = await makeStore()

      await store.upsert([{ vector: [1, 0, 0], metadata: { id: 'a', manufacturer: 'Audi' } }])

      expect(table.add).toHaveBeenCalledWith([{ vector: [1, 0, 0], id: 'a', manufacturer: 'Audi' }])
    })

    it('rechaza un vector de dimension incorrecta — LanceDB lo aceptaria corrompiendolo', async () => {
      const { store, table } = await makeStore()

      await expect(store.upsert([{ vector: [1, 0], metadata: {} }])).rejects.toThrow(/dimension/i)
      expect(table.add).not.toHaveBeenCalled()
    })

    it('no llama a la tabla si no hay registros', async () => {
      const { store, table } = await makeStore()

      await store.upsert([])

      expect(table.add).not.toHaveBeenCalled()
    })
  })

  describe('query', () => {
    it('busca con el limite indicado y sin predicado cuando no hay filtro', async () => {
      const { store, table } = await makeStore()

      await store.query({ vector: [1, 0, 0], limit: 4 })

      expect(table.search).toHaveBeenCalledWith([1, 0, 0])
      expect(table.query.limit).toHaveBeenCalledWith(4)
      expect(table.query.where).not.toHaveBeenCalled()
    })

    it('traduce la acotacion estructurada a predicado', async () => {
      const { store, table } = await makeStore()

      await store.query({
        vector: [1, 0, 0],
        limit: 5,
        filter: { manufacturer: 'Audi', model: 'A3' },
      })

      expect(table.query.where).toHaveBeenCalledWith("manufacturer = 'Audi' AND model = 'A3'")
    })

    it('acota solo por el campo presente', async () => {
      const { store, table } = await makeStore()

      await store.query({ vector: [1, 0, 0], limit: 5, filter: { model: 'Clio' } })

      expect(table.query.where).toHaveBeenCalledWith("model = 'Clio'")
    })

    it('ignora una acotacion vacia', async () => {
      const { store, table } = await makeStore()

      await store.query({ vector: [1, 0, 0], limit: 5, filter: {} })

      expect(table.query.where).not.toHaveBeenCalled()
    })

    it('escapa las comillas simples para que un valor no altere el predicado', async () => {
      const { store, table } = await makeStore()

      await store.query({
        vector: [1, 0, 0],
        limit: 5,
        filter: { manufacturer: "O'Neil' OR 1=1 --" },
      })

      expect(table.query.where).toHaveBeenCalledWith("manufacturer = 'O''Neil'' OR 1=1 --'")
    })

    it('separa los metadatos de las columnas propias de LanceDB', async () => {
      const { store } = await makeStore([
        { vector: [1, 0, 0], _distance: 0.25, id: 'a', manufacturer: 'Audi' },
      ])

      const matches = await store.query({ vector: [1, 0, 0], limit: 5 })

      expect(matches).toEqual([{ metadata: { id: 'a', manufacturer: 'Audi' }, distance: 0.25 }])
    })
  })
})
