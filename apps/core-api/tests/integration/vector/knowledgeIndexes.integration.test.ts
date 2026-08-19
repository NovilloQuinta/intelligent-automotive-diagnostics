import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'
import type { EmbeddingGeneratorPort } from '@/application/ports/EmbeddingGeneratorPort.js'
import type { VectorStorePort } from '@/application/ports/VectorStorePort.js'
import { createKnowledgeIndex } from '@/application/knowledge/createKnowledgeIndex.js'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import { initLanceDb } from '@/infrastructure/persistence/vector/lancedb.js'
import type { LanceDbConnection } from '@/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '@/infrastructure/persistence/vector/lanceVectorStore.js'
import {
  EMBEDDING_DIMENSIONS,
  PIDS_TABLE_CONFIG,
  DTCS_TABLE_CONFIG,
  DIAGNOSES_TABLE_CONFIG,
} from '@/infrastructure/persistence/vector/vectorTableConfigs.js'

/**
 * Recorre la cadena completa: indice de conocimiento → puerto VectorStorePort → adaptador
 * LanceDB → base real en disco. Verifica de paso el contrato entre los mappers y las
 * columnas de `vectorTableConfigs`.
 *
 * El embedding es determinista y falso —reparte cada texto en un eje segun su hash— para no
 * arrastrar la descarga de 118 MB del modelo real.
 */
const embed: EmbeddingGeneratorPort = (text) => {
  let hash = 0
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) % EMBEDDING_DIMENSIONS
  }
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0)
  vector[hash] = 1
  return Promise.resolve(vector)
}

const pidIndex = (store: VectorStorePort) =>
  createKnowledgeIndex({ store, embed, toMetadata: toPidMetadata, fromMetadata: toPidEntry })

const dtcIndex = (store: VectorStorePort) =>
  createKnowledgeIndex({ store, embed, toMetadata: toDtcMetadata, fromMetadata: toDtcEntry })

const diagnosisIndex = (store: VectorStorePort) =>
  createKnowledgeIndex({
    store,
    embed,
    toMetadata: toDiagnosisMetadata,
    fromMetadata: toDiagnosisEntry,
  })

describe('Indices de conocimiento — integracion real', () => {
  let dbPath: string
  let connection: LanceDbConnection

  beforeAll(async () => {
    dbPath = await mkdtemp(join(tmpdir(), 'lancedb-knowledge-'))
    connection = await initLanceDb(dbPath)
  })

  afterAll(async () => {
    await rm(dbPath, { recursive: true, force: true })
  })

  it('indexa y recupera un PID conservando todos sus metadatos', async () => {
    const index = pidIndex(await createLanceVectorStore(connection.db, PIDS_TABLE_CONFIG))
    const texto = 'Audi A3 PID 22F40C presion de aceite del motor'

    await index.index({
      id: 'pid-22F40C',
      embeddedText: texto,
      manufacturer: 'Audi',
      model: 'A3',
      confidence: 0.3,
      source: KnowledgeSource.Web,
      validated: false,
    })

    const results = await index.search(texto)

    expect(results).toHaveLength(1)
    expect(results[0].entry).toEqual({
      id: 'pid-22F40C',
      embeddedText: texto,
      manufacturer: 'Audi',
      model: 'A3',
      confidence: expect.closeTo(0.3, 5),
      source: KnowledgeSource.Web,
      validated: false,
    })
    expect(results[0].distance).toBeGreaterThanOrEqual(0)
    expect(await connection.db.tableNames()).toContain('pids_index')
  })

  it('indexa y recupera un DTC', async () => {
    const index = dtcIndex(await createLanceVectorStore(connection.db, DTCS_TABLE_CONFIG))
    const texto = 'Renault Clio P1234 sensor de posicion del arbol de levas'

    await index.index({
      id: 'dtc-P1234',
      embeddedText: texto,
      manufacturer: 'Renault',
      model: 'Clio',
      confidence: 0.8,
      source: KnowledgeSource.Mechanic,
      validated: false,
    })

    const results = await index.search(texto)

    expect(results).toHaveLength(1)
    expect(results[0].entry.id).toBe('dtc-P1234')
    expect(results[0].entry.source).toBe(KnowledgeSource.Mechanic)
    expect(results[0].entry.validated).toBe(false)
    expect(await connection.db.tableNames()).toContain('dtcs_index')
  })

  it('indexa un diagnostico reconstruyendo las listas serializadas', async () => {
    const index = diagnosisIndex(
      await createLanceVectorStore(connection.db, DIAGNOSES_TABLE_CONFIG),
    )
    const texto = 'Ralenti inestable en frio con testigo de motor encendido'

    await index.index({
      id: 'diag-001',
      embeddedText: texto,
      manufacturer: 'Seat',
      model: 'Leon',
      symptoms: ['ralenti inestable', 'testigo encendido'],
      pidsInvolved: ['010C', '0105'],
      confidence: 0.5,
      source: KnowledgeSource.PreviousDiagnosis,
    })

    const results = await index.search(texto)

    expect(results).toHaveLength(1)
    expect(results[0].entry.symptoms).toEqual(['ralenti inestable', 'testigo encendido'])
    expect(results[0].entry.pidsInvolved).toEqual(['010C', '0105'])
    expect(results[0].entry.confidence).toBeCloseTo(0.5, 5)
    expect(results[0].entry.source).toBe(KnowledgeSource.PreviousDiagnosis)
    expect(await connection.db.tableNames()).toContain('diagnoses_index')
  })

  it('acota los resultados por fabricante de extremo a extremo', async () => {
    const index = dtcIndex(await createLanceVectorStore(connection.db, DTCS_TABLE_CONFIG))
    const texto = 'fallo de encendido cilindro 1'

    await index.index({
      id: 'dtc-audi',
      embeddedText: texto,
      manufacturer: 'Audi',
      model: 'A3',
      confidence: 0.5,
      source: KnowledgeSource.Web,
      validated: false,
    })

    const soloRenault = await index.search(texto, { filter: { manufacturer: 'Renault' } })
    const soloAudi = await index.search(texto, { filter: { manufacturer: 'Audi' } })

    expect(soloRenault.map((r) => r.entry.id)).not.toContain('dtc-audi')
    expect(soloRenault.every((r) => r.entry.manufacturer === 'Renault')).toBe(true)
    expect(soloAudi.map((r) => r.entry.id)).toContain('dtc-audi')
    expect(soloAudi.every((r) => r.entry.manufacturer === 'Audi')).toBe(true)
  })

  it('un valor de filtro con comilla simple no rompe la consulta contra LanceDB real', async () => {
    const index = dtcIndex(await createLanceVectorStore(connection.db, DTCS_TABLE_CONFIG))

    const results = await index.search('cualquier consulta', {
      filter: { manufacturer: "O'Neil' OR 1=1 --" },
    })

    expect(results).toEqual([])
  })
})
