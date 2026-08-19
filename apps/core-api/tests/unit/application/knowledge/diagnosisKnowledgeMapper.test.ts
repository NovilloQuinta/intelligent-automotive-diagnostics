import { describe, it, expect } from 'vitest'
import {
  toDiagnosisMetadata,
  toDiagnosisEntry,
} from '@/application/knowledge/diagnosisKnowledgeMapper.js'
import type { DiagnosisKnowledgeEntry } from '@/application/dto/knowledge/DiagnosisKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'

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

  describe('metadatos corruptos o incompletos', () => {
    /** Metadatos validos salvo por las dos listas, que se sustituyen en cada caso. */
    function withLists(symptoms: unknown, pidsInvolved: unknown): Record<string, unknown> {
      return { ...toDiagnosisMetadata(entry), symptoms, pidsInvolved }
    }

    it('devuelve listas vacias cuando el campo falta', () => {
      const result = toDiagnosisEntry(withLists(undefined, undefined))

      expect(result.symptoms).toEqual([])
      expect(result.pidsInvolved).toEqual([])
    })

    it('devuelve listas vacias cuando el campo no es un string', () => {
      const result = toDiagnosisEntry(withLists(42, { a: 1 }))

      expect(result.symptoms).toEqual([])
      expect(result.pidsInvolved).toEqual([])
    })

    it('devuelve lista vacia con el string vacio', () => {
      expect(toDiagnosisEntry(withLists('', '')).symptoms).toEqual([])
    })

    it('devuelve lista vacia cuando el JSON esta corrupto, en vez de propagar el error', () => {
      expect(() => toDiagnosisEntry(withLists('[no es json', '{'))).not.toThrow()
      expect(toDiagnosisEntry(withLists('[no es json', '{')).symptoms).toEqual([])
    })

    it('devuelve lista vacia cuando el JSON es valido pero no es un array', () => {
      expect(toDiagnosisEntry(withLists('{"a":1}', '"texto"')).symptoms).toEqual([])
    })

    it('convierte a string los elementos que no lo son', () => {
      expect(toDiagnosisEntry(withLists('[1,true,null]', '[]')).symptoms).toEqual([
        '1',
        'true',
        'null',
      ])
    })
  })
})
