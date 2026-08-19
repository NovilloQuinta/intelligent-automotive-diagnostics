import { describe, it, expect, vi } from 'vitest'
import {
  ValidateDiscoveredPidUseCase,
  isWithinRange,
} from '@/application/use-cases/ValidateDiscoveredPidUseCase.js'
import { PidRawReadNotSupportedError } from '@/application/obd/obdErrors.js'
import type { ObdRepository } from '@/application/ports/ObdRepository.js'
import type { PidKnowledgeEntry } from '@/application/dto/knowledge/PidKnowledgeEntry.js'
import type { PidFormulaSource } from '@/application/dto/diagnosis/PidFormulaSource.js'
import { KnowledgeSource } from '@/domain/value-objects/KnowledgeSource.js'
import { Elm327ConnectionError } from '@/infrastructure/elm327/errors.js'

const entry: PidKnowledgeEntry = {
  id: 'pid-22F40C',
  embeddedText: 'Audi A3 PID 22F40C presion de aceite del motor',
  manufacturer: 'Audi',
  model: 'A3',
  confidence: 0.3,
  source: KnowledgeSource.Web,
  validated: false,
}

/** `A*256+B` sobre [0x0C, 0x80] da 3200. */
const formula: PidFormulaSource = {
  pidCode: { key: '22 F40C' },
  formula: 'A*256+B',
  dataBytes: 2,
}

/** Solo se mockea `readPidRaw`: es lo unico que el caso de uso invoca del puerto. */
function mockRepo(readPidRaw: ObdRepository['readPidRaw']): ObdRepository {
  return { readPidRaw } as unknown as ObdRepository
}

const useCase = new ValidateDiscoveredPidUseCase()

describe('ValidateDiscoveredPidUseCase', () => {
  it('confirma el PID y escala la confianza cuando el valor cae en rango', async () => {
    const readPidRaw = vi.fn().mockResolvedValue([0x0c, 0x80])

    const result = await useCase.execute(
      entry,
      formula,
      { minValue: 0, maxValue: 5000 },
      mockRepo(readPidRaw),
    )

    expect(readPidRaw).toHaveBeenCalledWith('22', 'F40C', 2)
    expect(result.outcome).toBe('validated')
    expect(result.entry.validated).toBe(true)
    expect(result.entry.confidence).toBe(0.7)
  })

  it('escala segun la procedencia: un PID aportado por un mecanico llega a 0.9', async () => {
    const mechanicEntry: PidKnowledgeEntry = {
      ...entry,
      source: KnowledgeSource.Mechanic,
      confidence: 0.8,
    }

    const result = await useCase.execute(
      mechanicEntry,
      formula,
      { minValue: 0, maxValue: 5000 },
      mockRepo(vi.fn().mockResolvedValue([0x0c, 0x80])),
    )

    expect(result.entry.confidence).toBe(0.9)
  })

  it('rechaza el PID sin tocar la entrada cuando el valor cae fuera de rango', async () => {
    const result = await useCase.execute(
      entry,
      formula,
      { minValue: 0, maxValue: 1000 },
      mockRepo(vi.fn().mockResolvedValue([0x0c, 0x80])),
    )

    expect(result.outcome).toBe('out_of_range')
    expect(result.entry).toEqual(entry)
  })

  it('trata el rango como abierto por el lado que no se especifica', async () => {
    const result = await useCase.execute(
      entry,
      formula,
      { minValue: 3000 },
      mockRepo(vi.fn().mockResolvedValue([0x0c, 0x80])),
    )

    expect(result.outcome).toBe('validated')
  })

  it('degrada sin excepcion cuando no hay vehiculo conectado', async () => {
    const result = await useCase.execute(entry, formula, { minValue: 0, maxValue: 5000 }, undefined)

    expect(result.outcome).toBe('no_vehicle')
    expect(result.entry).toEqual(entry)
  })

  it('degrada sin excepcion cuando el adaptador no soporta lectura cruda', async () => {
    const readPidRaw = vi.fn().mockRejectedValue(new PidRawReadNotSupportedError('22', 'F40C'))

    const result = await useCase.execute(
      entry,
      formula,
      { minValue: 0, maxValue: 5000 },
      mockRepo(readPidRaw),
    )

    expect(result.outcome).toBe('unsupported')
    expect(result.entry).toEqual(entry)
  })

  it('degrada sin excepcion cuando la formula descubierta no es parseable', async () => {
    const badFormula: PidFormulaSource = { ...formula, formula: '[A]*256+[B]' }

    const result = await useCase.execute(
      entry,
      badFormula,
      { minValue: 0, maxValue: 5000 },
      mockRepo(vi.fn().mockResolvedValue([0x0c, 0x80])),
    )

    expect(result.outcome).toBe('invalid_formula')
    expect(result.entry).toEqual(entry)
  })

  it('rechaza una clave de PID malformada en vez de leer un PID undefined', async () => {
    const malformed: PidFormulaSource = { ...formula, pidCode: { key: '22F40C' } }

    await expect(useCase.execute(entry, malformed, {}, mockRepo(vi.fn()))).rejects.toThrow(
      /Invalid PID key/,
    )
  })

  it('propaga un fallo real del adaptador: no es un "todavia no se puede confirmar"', async () => {
    const readPidRaw = vi.fn().mockRejectedValue(new Elm327ConnectionError('socket closed'))

    await expect(
      useCase.execute(entry, formula, { minValue: 0, maxValue: 5000 }, mockRepo(readPidRaw)),
    ).rejects.toThrow(Elm327ConnectionError)
  })
})

describe('isWithinRange', () => {
  it('incluye ambos extremos del rango', () => {
    expect(isWithinRange(0, { minValue: 0, maxValue: 100 })).toBe(true)
    expect(isWithinRange(100, { minValue: 0, maxValue: 100 })).toBe(true)
  })

  it('excluye lo que se sale por cualquiera de los dos lados', () => {
    expect(isWithinRange(-1, { minValue: 0, maxValue: 100 })).toBe(false)
    expect(isWithinRange(101, { minValue: 0, maxValue: 100 })).toBe(false)
  })

  it('deja abierto el lado cuyo extremo no se especifica', () => {
    expect(isWithinRange(-9999, { maxValue: 100 })).toBe(true)
    expect(isWithinRange(9999, { minValue: 0 })).toBe(true)
    expect(isWithinRange(9999, {})).toBe(true)
  })
})
