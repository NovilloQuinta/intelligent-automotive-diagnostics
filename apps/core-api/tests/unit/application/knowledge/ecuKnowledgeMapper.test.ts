import { describe, it, expect } from 'vitest'
import { toEcuMetadata, toEcuEntry } from '@/application/knowledge/ecuKnowledgeMapper.js'
import type { EcuKnowledgeEntry } from '@/application/dto/knowledge/EcuKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

const entry: EcuKnowledgeEntry = {
  id: 'ecu-7E9',
  embeddedText: 'Audi A3 transmission control module at response address 7E9',
  manufacturer: 'Audi',
  model: 'A3',
  responseAddr: '7E9',
  requestAddr: '7E1',
  name: 'Transmission Control Module',
  type: 'TCM',
  system: 'Transmission',
  confidence: 0.8,
  source: KnowledgeSource.Mechanic,
}

describe('ecuKnowledgeMapper', () => {
  it('serializa direcciones, nombre/tipo/sistema y confianza de la ECU', () => {
    expect(toEcuMetadata(entry)).toEqual({
      id: 'ecu-7E9',
      embeddedText: 'Audi A3 transmission control module at response address 7E9',
      manufacturer: 'Audi',
      model: 'A3',
      responseAddr: '7E9',
      requestAddr: '7E1',
      name: 'Transmission Control Module',
      type: 'TCM',
      system: 'Transmission',
      confidence: 0.8,
      source: KnowledgeSource.Mechanic,
    })
  })

  it('reconstruye la entrada desde sus metadatos sin perder ningun campo', () => {
    expect(toEcuEntry(toEcuMetadata(entry))).toEqual(entry)
  })

  it('serializa system vacio y lo reconstruye como undefined', () => {
    const withoutSystem: EcuKnowledgeEntry = { ...entry, system: undefined }

    expect(toEcuEntry(toEcuMetadata(withoutSystem))).toEqual(withoutSystem)
  })
})
