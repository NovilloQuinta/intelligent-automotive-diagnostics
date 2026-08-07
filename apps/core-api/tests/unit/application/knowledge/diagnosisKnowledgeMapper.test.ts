import { describe, it, expect } from 'vitest'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

const entry: DiagnosisKnowledgeEntry = {
  id: 'diag-001',
  embeddedText: 'Ralenti inestable en frio con testigo de motor encendido',
  manufacturer: 'Seat',
  model: 'Leon',
  symptoms: ['ralenti inestable', 'testigo encendido'],
  pidsInvolved: ['010C', '0105'],
  confidence: 0.5,
  source: KnowledgeSource.PreviousDiagnosis,
}

describe('diagnosisKnowledgeMapper', () => {
  it('serializa confianza y procedencia junto a las listas', () => {
    const metadata = toDiagnosisMetadata(entry)

    expect(metadata).toEqual({
      id: 'diag-001',
      embeddedText: 'Ralenti inestable en frio con testigo de motor encendido',
      manufacturer: 'Seat',
      model: 'Leon',
      symptoms: JSON.stringify(['ralenti inestable', 'testigo encendido']),
      pidsInvolved: JSON.stringify(['010C', '0105']),
      confidence: 0.5,
      source: KnowledgeSource.PreviousDiagnosis,
    })
  })

  it('reconstruye la entrada desde sus metadatos sin perder ningun campo', () => {
    expect(toDiagnosisEntry(toDiagnosisMetadata(entry))).toEqual(entry)
  })

  it('no expone ningun campo de validacion OBD: un caso de diagnostico no se lee del vehiculo', () => {
    expect(toDiagnosisMetadata(entry)).not.toHaveProperty('validated')
    expect(toDiagnosisEntry(toDiagnosisMetadata(entry))).not.toHaveProperty('validated')
  })
})
