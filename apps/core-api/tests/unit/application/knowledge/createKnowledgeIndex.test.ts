import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import type { VectorMatch } from '@/application/dto/vector/VectorMatch.js'

interface Entry {
  readonly id: string
  readonly embeddedText: string
}

function makeStore(matches: VectorMatch[] = []) {
  return {
    upsert: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue(matches),
  }
}

function makeRepo(store: ReturnType<typeof makeStore>) {
  const embed = vi.fn().mockResolvedValue([1, 0, 0])

  return {
    embed,
    repo: createKnowledgeIndex<Entry>({
      store,
      embed,
      defaultLimit: 5,
      toMetadata: (entry) => ({ id: entry.id, embeddedText: entry.embeddedText }),
      fromMetadata: (metadata) => ({
        id: metadata.id as string,
        embeddedText: metadata.embeddedText as string,
      }),
    }),
  }
}

describe('createKnowledgeIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('index', () => {
    it('embebe el texto de la entrada y la guarda con sus metadatos', async () => {
      const store = makeStore()
      const { repo, embed } = makeRepo(store)

      await repo.index({ id: 'p1', embeddedText: 'presion de aceite' })

      expect(embed).toHaveBeenCalledWith('presion de aceite')
      expect(store.upsert).toHaveBeenCalledWith([
        { vector: [1, 0, 0], metadata: { id: 'p1', embeddedText: 'presion de aceite' } },
      ])
    })
  })

  describe('search', () => {
    it('embebe la consulta y aplica el limite por defecto', async () => {
      const store = makeStore()
      const { repo, embed } = makeRepo(store)

      await repo.search('ralenti inestable')

      expect(embed).toHaveBeenCalledWith('ralenti inestable')
      expect(store.query).toHaveBeenCalledWith({
        vector: [1, 0, 0],
        limit: 5,
        filter: undefined,
      })
    })

    it('respeta el limite indicado', async () => {
      const store = makeStore()
      const { repo } = makeRepo(store)

      await repo.search('consulta', { limit: 2 })

      expect(store.query).toHaveBeenCalledWith(expect.objectContaining({ limit: 2 }))
    })

    it('traslada la acotacion al almacen tal cual, sin traducirla', async () => {
      const store = makeStore()
      const { repo } = makeRepo(store)

      await repo.search('consulta', { filter: { manufacturer: 'Audi', model: 'A3' } })

      // La factory no conoce ninguna sintaxis de consulta: reenvia el filtro estructurado
      // y es el adaptador quien lo traduce.
      expect(store.query).toHaveBeenCalledWith(
        expect.objectContaining({ filter: { manufacturer: 'Audi', model: 'A3' } }),
      )
    })

    it('mapea las coincidencias a entradas de dominio conservando la distancia', async () => {
      const store = makeStore([
        { metadata: { id: 'p1', embeddedText: 'uno' }, distance: 0.1 },
        { metadata: { id: 'p2', embeddedText: 'dos' }, distance: 0.4 },
      ])
      const { repo } = makeRepo(store)

      const results = await repo.search('consulta')

      expect(results).toEqual([
        { entry: { id: 'p1', embeddedText: 'uno' }, distance: 0.1 },
        { entry: { id: 'p2', embeddedText: 'dos' }, distance: 0.4 },
      ])
    })

    it('devuelve vacio cuando el almacen no encuentra nada', async () => {
      const store = makeStore([])
      const { repo } = makeRepo(store)

      expect(await repo.search('consulta')).toEqual([])
    })
  })
})
