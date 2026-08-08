import { describe, it, expect, vi } from 'vitest'
import { ValidateDiscoveredDtcUseCase } from '@/application/use-cases/ValidateDiscoveredDtcUseCase.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { DtcKnowledgeEntry } from '@/application/dto/knowledge/DtcKnowledgeEntry.js'
import { KnowledgeSource } from '@/domain/value-objects/knowledgeSource.js'

const entry: DtcKnowledgeEntry = {
  id: 'dtc-P1234',
  embeddedText: 'Renault Clio P1234 sensor de posicion del arbol de levas',
  manufacturer: 'Renault',
  model: 'Clio',
  confidence: 0.3,
  source: KnowledgeSource.Web,
  validated: false,
}

/** Solo se mockea `readDtcCodes`: es lo unico que el caso de uso invoca del puerto. */
function mockRepo(codes: string[]): ObdRepository {
  return {
    readDtcCodes: vi.fn().mockResolvedValue(codes.map((code) => ({ code }))),
  } as unknown as ObdRepository
}

const useCase = new ValidateDiscoveredDtcUseCase()

describe('ValidateDiscoveredDtcUseCase', () => {
  it('confirma el DTC y escala la confianza cuando el codigo aparece en el vehiculo', async () => {
    const result = await useCase.execute(entry, 'P1234', mockRepo(['P0301', 'P1234']))

    expect(result.outcome).toBe('validated')
    expect(result.entry.validated).toBe(true)
    expect(result.entry.confidence).toBe(0.7)
  })

  it('escala segun la procedencia: un DTC aportado por un mecanico llega a 0.9', async () => {
    const mechanicEntry: DtcKnowledgeEntry = {
      ...entry,
      source: KnowledgeSource.Mechanic,
      confidence: 0.8,
    }

    const result = await useCase.execute(mechanicEntry, 'P1234', mockRepo(['P1234']))

    expect(result.entry.confidence).toBe(0.9)
  })

  it('deja la entrada intacta cuando el codigo no aparece', async () => {
    const result = await useCase.execute(entry, 'P1234', mockRepo(['P0301']))

    expect(result.outcome).toBe('not_found')
    expect(result.entry).toEqual(entry)
  })

  it('no se confunde con un vehiculo sin ningun DTC activo', async () => {
    const result = await useCase.execute(entry, 'P1234', mockRepo([]))

    expect(result.outcome).toBe('not_found')
  })

  it('degrada sin excepcion cuando no hay vehiculo conectado', async () => {
    const result = await useCase.execute(entry, 'P1234', undefined)

    expect(result.outcome).toBe('no_vehicle')
    expect(result.entry).toEqual(entry)
  })
})
