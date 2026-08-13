import { describe, expect, it } from 'vitest'
import {
  buildPidRows,
  buildSelectablePidRows,
  mergePidRows,
  pidObservationToRow,
  togglePid,
  pruneOrphanPids,
  mode01Code,
  FIXED_PID_CODES,
  DEFAULT_LIVE_PIDS,
  PID_RPM,
  PID_COOLANT,
  PID_SPEED,
  PID_INTAKE,
  type PidRow,
} from '../../../src/components/dashboard/pidCatalog'

const PARSED_VALUES = {
  rpm: 850,
  coolantTemp: 90,
  speed: 50,
  intakeTemp: 35,
}

function aiRow(code: string, value = '14 %'): PidRow {
  return {
    code,
    description: 'PID de la IA',
    value,
    status: 'ok',
    source: 'ai',
  }
}

describe('PID constants', () => {
  it('defines the 4 short codes with their names', () => {
    expect(PID_RPM).toBe('0C')
    expect(PID_COOLANT).toBe('05')
    expect(PID_SPEED).toBe('0D')
    expect(PID_INTAKE).toBe('0F')
  })

  it('derives DEFAULT_LIVE_PIDS from the short code constants', () => {
    expect(DEFAULT_LIVE_PIDS).toEqual([PID_RPM, PID_COOLANT, PID_SPEED, PID_INTAKE])
  })

  it('derives FIXED_PID_CODES from the same short code constants', () => {
    expect([...FIXED_PID_CODES].sort()).toEqual(
      [
        mode01Code(PID_RPM),
        mode01Code(PID_COOLANT),
        mode01Code(PID_SPEED),
        mode01Code(PID_INTAKE),
      ].sort(),
    )
  })

  it('prepends the Mode 01 prefix through mode01Code', () => {
    expect(mode01Code('0C')).toBe('01 0C')
    expect(mode01Code('11')).toBe('01 11')
  })
})

describe('FIXED_PID_CODES', () => {
  it('contains exactly the 4 codes rendered from parsedValues', () => {
    expect([...FIXED_PID_CODES].sort()).toEqual(['01 05', '01 0C', '01 0D', '01 0F'])
  })
})

describe('buildPidRows', () => {
  it('marks every fixed row with source fixed', () => {
    const rows = buildPidRows(PARSED_VALUES)

    expect(rows).toHaveLength(4)
    expect(rows.every((r) => r.source === 'fixed')).toBe(true)
  })

  it('derives each row code from the shared short code constants', () => {
    const rows = buildPidRows(PARSED_VALUES)

    expect(rows.map((r) => r.code)).toEqual([
      mode01Code(PID_RPM),
      mode01Code(PID_COOLANT),
      mode01Code(PID_SPEED),
      mode01Code(PID_INTAKE),
    ])
  })
})

describe('togglePid', () => {
  it('appends a new short code when under the limit', () => {
    expect(togglePid(['0C', '05', '0D'], '0F')).toEqual(['0C', '05', '0D', '0F'])
  })

  it('removes an already selected code', () => {
    expect(togglePid(['0C', '05', '0D', '0F'], '05')).toEqual(['0C', '0D', '0F'])
  })

  it('ignores a new selection once the limit is reached', () => {
    const full = ['0C', '05', '0D', '0F', '11', '42', '04', '0B']

    expect(togglePid(full, '0E')).toEqual(full)
  })

  it('still allows deselecting a code when at the limit', () => {
    const full = ['0C', '05', '0D', '0F', '11', '42', '04', '0B']

    expect(togglePid(full, '11')).toHaveLength(7)
  })
})

describe('pruneOrphanPids', () => {
  it('keeps selected codes that still have a visible row', () => {
    expect(pruneOrphanPids(['0C', '05', '0D', '0F'], ['0C', '05', '0D', '0F'])).toEqual([
      '0C',
      '05',
      '0D',
      '0F',
    ])
  })

  it('drops selected codes with no visible row', () => {
    expect(pruneOrphanPids(['0C', '05', '0D', '0F', '11'], ['0C', '05', '0D', '0F'])).toEqual([
      '0C',
      '05',
      '0D',
      '0F',
    ])
  })

  it('preserves the original selection order', () => {
    expect(pruneOrphanPids(['05', '0C', '11', '0D'], ['0C', '05', '0D', '0F'])).toEqual([
      '05',
      '0C',
      '0D',
    ])
  })

  it('returns an empty list when nothing selected is visible', () => {
    expect(pruneOrphanPids(['11'], [])).toEqual([])
  })
})

describe('pidObservationToRow', () => {
  it('maps an observation to a formatted AI row', () => {
    const row = pidObservationToRow({
      code: '01 42',
      name: 'Voltaje del módulo de control',
      unit: 'V',
      value: 10.9,
      status: 'review',
    })

    expect(row).toEqual({
      code: '01 42',
      description: 'Voltaje del módulo de control',
      value: '10.9 V',
      status: 'review',
      source: 'ai',
    })
  })

  it('omits the unit when the observation has none', () => {
    const row = pidObservationToRow({
      code: '01 11',
      name: 'Posición del acelerador',
      value: 14,
      status: 'ok',
    })

    expect(row.value).toBe('14')
  })
})

describe('mergePidRows', () => {
  it('appends AI rows whose code is not a fixed one', () => {
    const fixed = buildPidRows(PARSED_VALUES)

    const merged = mergePidRows(fixed, [aiRow('01 11'), aiRow('01 42')])

    expect(merged).toHaveLength(6)
    expect(merged.slice(0, 4)).toEqual(fixed)
    expect(merged.slice(4).map((r) => r.code)).toEqual(['01 11', '01 42'])
  })

  it('discards AI rows whose code is already a fixed one', () => {
    const fixed = buildPidRows(PARSED_VALUES)

    const merged = mergePidRows(fixed, [
      aiRow('01 0C'),
      aiRow('01 05'),
      aiRow('01 0D'),
      aiRow('01 0F'),
      aiRow('01 11'),
    ])

    expect(merged.map((r) => r.code)).toEqual(['01 0C', '01 05', '01 0D', '01 0F', '01 11'])
  })

  it('deduplicates AI rows by code keeping the last one', () => {
    const fixed = buildPidRows(PARSED_VALUES)

    const merged = mergePidRows(fixed, [aiRow('01 11', '14 %'), aiRow('01 11', '52 %')])

    expect(merged).toHaveLength(5)
    expect(merged[4].value).toBe('52 %')
  })

  it('returns only the fixed rows when there are no AI rows', () => {
    const fixed = buildPidRows(PARSED_VALUES)

    expect(mergePidRows(fixed, null)).toEqual(fixed)
    expect(mergePidRows(fixed, [])).toEqual(fixed)
  })
})

describe('buildSelectablePidRows', () => {
  const CATALOG = [
    { code: '01 0C', name: 'Engine RPM', unit: 'rpm' },
    { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C' },
    { code: '01 11', name: 'Throttle Position', unit: '%' },
  ]

  it('overlays the deterministic value + verdict for the 4 fixed PIDs', () => {
    const rows = buildSelectablePidRows(CATALOG, PARSED_VALUES, null)

    const rpm = rows.find((r) => r.code === '01 0C')!
    expect(rpm.value).toBe('850 RPM')
    expect(rpm.status).toBe('ok')
    expect(rpm.source).toBe('fixed')
  })

  it('renders non-fixed catalog PIDs as `—` without verdict when there is no reading', () => {
    const rows = buildSelectablePidRows(CATALOG, PARSED_VALUES, null)

    const throttle = rows.find((r) => r.code === '01 11')!
    expect(throttle.value).toBe('—')
    expect(throttle.status).toBeNull()
    expect(throttle.source).toBe('catalog')
  })

  it('fills a non-fixed catalog PID with its live reading', () => {
    const readings = [{ code: '01 11', name: 'Throttle Position', unit: '%', value: 14 }]

    const rows = buildSelectablePidRows(CATALOG, PARSED_VALUES, readings)

    expect(rows.find((r) => r.code === '01 11')!.value).toBe('14 %')
  })
})
