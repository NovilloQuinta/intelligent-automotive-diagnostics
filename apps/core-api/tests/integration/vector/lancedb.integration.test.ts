import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  initLanceDb,
  ensureVectorTable,
  assertVectorDimensions,
} from '@/infrastructure/persistence/vector/lancedb.js'
import type { LanceDbConnection } from '@/infrastructure/persistence/vector/lancedb.js'

/** Vector unitario a lo largo de un eje — permite razonar sobre que resultado es el mas cercano. */
function axis(index: number, dimensions: number): number[] {
  return Array.from({ length: dimensions }, (_, i) => (i === index ? 1 : 0))
}

/**
 * Tests contra una instancia REAL de LanceDB embebida.
 *
 * Los unitarios mockean `@lancedb/lancedb` entero, asi que nunca comprueban que el esquema
 * sea valido. Ese punto ciego dejo pasar dos fallos: los tipos `string` y `boolean`
 * reventaban al llegar al sanitizador de Arrow, y LanceDB no valida las dimensiones del
 * vector. Estos tests cierran el hueco.
 *
 * No se invoca `createEmbedding`: los vectores se inyectan a mano para no arrastrar la
 * descarga de 118 MB del modelo.
 */
describe('LanceDB — integracion real', () => {
  let dbPath: string
  let connection: LanceDbConnection

  beforeAll(async () => {
    dbPath = await mkdtemp(join(tmpdir(), 'lancedb-it-'))
    connection = await initLanceDb(dbPath)
  })

  afterAll(async () => {
    await rm(dbPath, { recursive: true, force: true })
  })

  it('conecta y arranca sin tablas', () => {
    expect(connection.db).toBeDefined()
    expect(connection.tableNames).toEqual([])
  })

  it('traduce los cuatro tipos soportados a sus clases Arrow', async () => {
    // Regresion del bug original: LanceDB solo conoce `utf8` y `bool`, asi que `string` y
    // `boolean` reventaban antes de mapearlos a clases Arrow explicitas.
    const table = await ensureVectorTable(connection.db, 'all_types', {
      dimensions: 4,
      columns: [
        { name: 'name', type: 'string' },
        { name: 'score', type: 'float32' },
        { name: 'count', type: 'int32' },
        { name: 'active', type: 'boolean' },
      ],
    })

    const schema = await table.schema()
    const byName = Object.fromEntries(schema.fields.map((f) => [f.name, f.type.toString()]))

    expect(byName.name).toMatch(/utf8/i)
    expect(byName.score).toMatch(/float/i)
    expect(byName.count).toMatch(/int/i)
    expect(byName.active).toMatch(/bool/i)
  })

  it('rechaza un tipo de columna no soportado', async () => {
    await expect(
      ensureVectorTable(connection.db, 'bad_table', {
        dimensions: 4,
        columns: [{ name: 'id', type: 'unsupported' as never }],
      }),
    ).rejects.toThrow()
  })
})

describe('ensureVectorTable — integracion real', () => {
  let dbPath: string
  let connection: LanceDbConnection

  beforeAll(async () => {
    dbPath = await mkdtemp(join(tmpdir(), 'lancedb-vec-'))
    connection = await initLanceDb(dbPath)
  })

  afterAll(async () => {
    await rm(dbPath, { recursive: true, force: true })
  })

  it('crea la columna vector con las dimensiones del modelo de embeddings', async () => {
    const table = await ensureVectorTable(connection.db, 'pids_index', {
      dimensions: 384,
      columns: [
        { name: 'id', type: 'string' },
        { name: 'embeddedText', type: 'string' },
        { name: 'confidence', type: 'float32' },
        { name: 'obdValidated', type: 'boolean' },
      ],
    })

    const schema = await table.schema()
    const vector = schema.fields.find((f) => f.name === 'vector')

    expect(vector).toBeDefined()
    expect(vector?.type.toString()).toMatch(/fixed_?size_?list/i)
    expect(schema.fields.map((f) => f.name)).toEqual([
      'vector',
      'id',
      'embeddedText',
      'confidence',
      'obdValidated',
    ])
  })

  it('inserta y recupera por similitud, con el mas parecido primero', async () => {
    // Dimension pequena a proposito: con vectores unitarios por eje se puede razonar
    // sobre cual es el resultado mas cercano sin depender del modelo de embeddings.
    const table = await ensureVectorTable(connection.db, 'similarity', {
      dimensions: 4,
      columns: [{ name: 'label', type: 'string' }],
    })

    await table.add([
      { vector: axis(0, 4), label: 'eje-0' },
      { vector: axis(1, 4), label: 'eje-1' },
      { vector: axis(2, 4), label: 'eje-2' },
    ])

    const results = await table.search(axis(1, 4)).limit(2).toArray()

    expect(results).toHaveLength(2)
    expect(results[0].label).toBe('eje-1')
    expect(results[0]._distance).toBeLessThan(results[1]._distance)
  })

  it('LanceDB NO valida la dimension: rellena con null o trunca, en silencio', async () => {
    // Comportamiento real verificado en LanceDB 0.31. Es corrupcion silenciosa: un vector
    // con `null` produce similitudes basura. Por eso la dimension se valida en nuestra capa.
    const table = await ensureVectorTable(connection.db, 'loose_dims', {
      dimensions: 4,
      columns: [{ name: 'label', type: 'string' }],
    })

    await table.add([{ vector: [1, 0], label: 'corto' }])
    await table.add([{ vector: [1, 2, 3, 4, 5, 6], label: 'largo' }])

    const rows = await table.query().toArray()
    const corto = rows.find((r) => r.label === 'corto')
    const largo = rows.find((r) => r.label === 'largo')

    expect(Array.from(corto.vector)).toEqual([1, 0, null, null])
    expect(Array.from(largo.vector)).toHaveLength(4)
  })

  it('assertVectorDimensions si rechaza la dimension incorrecta', () => {
    expect(() => assertVectorDimensions([1, 0], 4)).toThrow(/dimension/i)
    expect(() => assertVectorDimensions([1, 2, 3, 4, 5, 6], 4)).toThrow(/dimension/i)
    expect(() => assertVectorDimensions([1, 2, 3, 4], 4)).not.toThrow()
  })

  it('es idempotente', async () => {
    const options = { dimensions: 4, columns: [{ name: 'label', type: 'string' as const }] }
    await ensureVectorTable(connection.db, 'idem_vec', options)
    const reopened = await ensureVectorTable(connection.db, 'idem_vec', options)

    expect(await reopened.countRows()).toBe(0)
    const names = await connection.db.tableNames()
    expect(names.filter((n) => n === 'idem_vec')).toHaveLength(1)
  })

  it('rechaza dimensiones no positivas', async () => {
    await expect(
      ensureVectorTable(connection.db, 'bad_dims', {
        dimensions: 0,
        columns: [{ name: 'label', type: 'string' }],
      }),
    ).rejects.toThrow()
  })
})
