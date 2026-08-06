/**
 * Verificacion REAL de la busqueda semantica: modelo de embeddings de verdad + LanceDB en disco.
 *
 * Los tests automaticos inyectan vectores sinteticos para no arrastrar la descarga del modelo,
 * asi que nunca comprueban que la semantica funcione. Esto si.
 *
 * Uso: pnpm verify:semantic
 * La primera ejecucion descarga ~118 MB del modelo y queda cacheada.
 */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KnowledgeSource } from '../src/domain/value-objects/knowledgeSource.js'
import { createKnowledgeIndex } from '../src/application/knowledge/createKnowledgeIndex.js'
import { toDtcMetadata, toDtcEntry } from '../src/application/knowledge/dtcKnowledgeMapper.js'
import { createEmbedding } from '../src/infrastructure/persistence/vector/embedding.js'
import { initLanceDb } from '../src/infrastructure/persistence/vector/lancedb.js'
import { createLanceVectorStore } from '../src/infrastructure/persistence/vector/lanceVectorStore.js'
import { DTCS_TABLE_CONFIG } from '../src/infrastructure/persistence/vector/vectorTableConfigs.js'

/** Conocimiento de taller, mezclando espanol e ingles para probar el modelo multilingue. */
const CORPUS = [
  'P0521 presion de aceite del motor demasiado baja, sensor de presion defectuoso',
  'Low engine oil pressure warning, worn oil pump or clogged filter',
  'P0301 fallo de encendido detectado en el cilindro 1, bujia o bobina en mal estado',
  'P0171 mezcla demasiado pobre en el banco 1, posible entrada de aire falsa',
  'Sistema de refrigeracion sobrecalentado, termostato bloqueado o radiador obstruido',
  'P0420 rendimiento del catalizador por debajo del umbral en el banco 1',
  'Bateria descargada, alternador no carga correctamente',
  'Fugas en el circuito de frenos, pastillas desgastadas y disco rayado',
]

const CONSULTAS = [
  { texto: 'el motor pierde presion de lubricacion', esperado: 'aceite' },
  { texto: 'oil pressure too low', esperado: 'aceite (consulta en INGLES)' },
  { texto: 'el coche tiembla al ralenti', esperado: 'fallo de encendido' },
  { texto: 'se calienta demasiado', esperado: 'refrigeracion' },
  { texto: 'no arranca por la manana', esperado: 'bateria' },
]

async function main(): Promise<void> {
  const dbPath = await mkdtemp(join(tmpdir(), 'verify-semantic-'))
  console.log(`LanceDB en ${dbPath}\n`)

  console.log('Cargando modelo de embeddings (la primera vez descarga ~118 MB)...')
  const inicio = Date.now()
  const muestra = await createEmbedding('prueba')
  console.log(`Modelo listo en ${((Date.now() - inicio) / 1000).toFixed(1)}s`)
  console.log(`Dimensiones: ${muestra.length}`)

  const norma = Math.sqrt(muestra.reduce((acc, v) => acc + v * v, 0))
  console.log(`Norma L2: ${norma.toFixed(6)} ${Math.abs(norma - 1) < 0.01 ? '(normalizado ✓)' : '(NO normalizado ✗)'}\n`)

  const connection = await initLanceDb(dbPath)
  const store = await createLanceVectorStore(connection.db, DTCS_TABLE_CONFIG)
  const index = createKnowledgeIndex({
    store,
    embed: createEmbedding,
    toMetadata: toDtcMetadata,
    fromMetadata: toDtcEntry,
  })

  console.log(`Indexando ${CORPUS.length} entradas...`)
  for (const [i, texto] of CORPUS.entries()) {
    await index.index({
      id: `dtc-${i}`,
      embeddedText: texto,
      manufacturer: 'Generico',
      model: 'Generico',
      confidence: 0.8,
      source: KnowledgeSource.Mechanic,
    })
  }
  console.log('Listo\n')
  console.log('='.repeat(78))

  for (const { texto, esperado } of CONSULTAS) {
    const resultados = await index.search(texto, { limit: 3 })
    console.log(`\nCONSULTA: "${texto}"`)
    console.log(`ESPERADO: ${esperado}`)
    resultados.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.distance.toFixed(4)}] ${r.entry.embeddedText.slice(0, 68)}`)
    })
  }

  console.log(`\n${'='.repeat(78)}`)
  console.log('\nFILTRADO combinado con semantica:')
  const filtrados = await index.search('problema de presion', {
    limit: 3,
    filter: { manufacturer: 'Generico' },
  })
  console.log(`  con filtro manufacturer=Generico → ${filtrados.length} resultados`)
  const vacios = await index.search('problema de presion', {
    limit: 3,
    filter: { manufacturer: 'NoExiste' },
  })
  console.log(`  con filtro manufacturer=NoExiste → ${vacios.length} resultados`)

  await rm(dbPath, { recursive: true, force: true })
  console.log('\nDirectorio temporal eliminado.')
}

main().catch((error: unknown) => {
  console.error('FALLO:', error)
  process.exit(1)
})
