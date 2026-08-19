import { describe, it, expect } from 'vitest'
import { dtcCodeSchema } from '@/infrastructure/http/openapi/contracts/diagnosis.js'
import { DtcCode } from '@/domain/value-objects/DtcCode.js'

/**
 * El origen del DTC viaja hasta la UI sin mapper por el medio: los `DtcCode` se
 * serializan tal cual. Este test es la red que avisa si alguien intercala una
 * proyeccion que se lo deje por el camino.
 */
describe('contrato de respuesta de DTC', () => {
  it('should carry the reporting ECU through to the response', () => {
    const dtc = new DtcCode({ code: 'P0301', description: 'Cylinder 1 Misfire', ecuAddress: '7E8' })

    const parsed = dtcCodeSchema.parse(JSON.parse(JSON.stringify(dtc)))

    expect(parsed.ecuAddress).toBe('7E8')
  })

  it('should accept a code with no origin', () => {
    const dtc = new DtcCode({ code: 'P0301', description: 'Cylinder 1 Misfire' })

    const parsed = dtcCodeSchema.parse(JSON.parse(JSON.stringify(dtc)))

    expect(parsed.ecuAddress).toBeUndefined()
    expect(parsed.code).toBe('P0301')
  })

  it('should carry a 29-bit address unchanged', () => {
    const dtc = new DtcCode({ code: 'P0401', ecuAddress: '18DAF110' })

    expect(dtcCodeSchema.parse(JSON.parse(JSON.stringify(dtc))).ecuAddress).toBe('18DAF110')
  })
})
