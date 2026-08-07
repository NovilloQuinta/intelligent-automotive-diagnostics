import { describe, it, expect } from 'vitest'
import { toDtcMetadata, toDtcEntry } from '@/application/knowledge/dtcKnowledgeMapper.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

const entry: DtcKnowledgeEntry = {
  id: 'dtc-P1234',
  embeddedText: 'Renault Clio P1234 sensor de posicion del arbol de levas',
  manufacturer: 'Renault',
  model: 'Clio',
  confidence: 0.8,
  source: KnowledgeSource.Mechanic,
  validated: false,
}

describe('dtcKnowledgeMapper', () => {
  it('serializa el estado de validacion OBD del DTC', () => {
    const metadata = toDtcMetadata(entry)

    expect(metadata).toEqual({
      id: 'dtc-P1234',
      embeddedText: 'Renault Clio P1234 sensor de posicion del arbol de levas',
      manufacturer: 'Renault',
      model: 'Clio',
      confidence: 0.8,
      source: KnowledgeSource.Mechanic,
      validated: false,
    })
  })

  it('reconstruye la entrada desde sus metadatos sin perder ningun campo', () => {
    expect(toDtcEntry(toDtcMetadata(entry))).toEqual(entry)
  })

  it('conserva un DTC ya validado contra el vehiculo real', () => {
    const validated: DtcKnowledgeEntry = { ...entry, validated: true, confidence: 0.9 }

    expect(toDtcEntry(toDtcMetadata(validated))).toEqual(validated)
  })
})
