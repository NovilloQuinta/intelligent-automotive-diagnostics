import { describe, it, expect } from 'vitest'
import { toPidMetadata, toPidEntry } from '@/application/knowledge/pidKnowledgeMapper.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

const entry: PidKnowledgeEntry = {
  id: 'pid-22F40C',
  embeddedText: 'Audi A3 PID 22F40C presion de aceite del motor',
  manufacturer: 'Audi',
  model: 'A3',
  confidence: 0.3,
  source: KnowledgeSource.Web,
  validated: false,
}

describe('pidKnowledgeMapper', () => {
  it('nombra el campo de validacion OBD como `validated`, igual que en el DTC', () => {
    const metadata = toPidMetadata(entry)

    expect(metadata).toEqual({
      id: 'pid-22F40C',
      embeddedText: 'Audi A3 PID 22F40C presion de aceite del motor',
      manufacturer: 'Audi',
      model: 'A3',
      confidence: 0.3,
      source: KnowledgeSource.Web,
      validated: false,
    })
  })

  it('reconstruye la entrada desde sus metadatos sin perder ningun campo', () => {
    expect(toPidEntry(toPidMetadata(entry))).toEqual(entry)
  })

  it('conserva una entrada ya validada con su confianza escalada', () => {
    const validated: PidKnowledgeEntry = { ...entry, validated: true, confidence: 0.7 }

    expect(toPidEntry(toPidMetadata(validated))).toEqual(validated)
  })
})
