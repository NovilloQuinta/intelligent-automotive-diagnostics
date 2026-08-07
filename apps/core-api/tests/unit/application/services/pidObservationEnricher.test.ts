import { describe, it, expect } from 'vitest'
import { derivePidObservations } from '@/application/services/pidObservationEnricher.js'
import type { ToolCallTrace } from '@/application/dto/llm/ToolCallTrace.js'

function readPid(mode: string, pid: string, result: string): ToolCallTrace {
  return { tool: 'read_pid', args: { mode, pid }, result }
}

describe('derivePidObservations', () => {
  it('should map a known read_pid call to an enriched observation', () => {
    const observations = derivePidObservations([readPid('01', '0C', '850')])

    expect(observations).toEqual([
      {
        code: '01 0C',
        name: 'Régimen del motor',
        unit: 'rpm',
        value: 850,
        status: 'ok',
      },
    ])
  })

  it('should mark an out-of-range reading as review', () => {
    const observations = derivePidObservations([readPid('01', '42', '10.9')])

    expect(observations).toHaveLength(1)
    expect(observations[0].status).toBe('review')
  })

  it('should ignore tools other than read_pid', () => {
    const trace: ToolCallTrace = { tool: 'get_dtc_codes', args: {}, result: 'P0301' }

    expect(derivePidObservations([trace])).toEqual([])
  })

  it('should ignore read_pid calls whose code is not in the catalog', () => {
    expect(derivePidObservations([readPid('01', '0B', '102')])).toEqual([])
  })

  it('should ignore read_pid calls with a non-numeric result', () => {
    expect(derivePidObservations([readPid('01', '0C', '[client_error] boom')])).toEqual([])
  })

  it('should ignore read_pid calls with args that are not valid PID codes', () => {
    const trace: ToolCallTrace = {
      tool: 'read_pid',
      args: { mode: 'zz', pid: '0C' },
      result: '850',
    }

    expect(derivePidObservations([trace])).toEqual([])
  })

  it('should normalise lowercase and padded args before the catalog lookup', () => {
    const observations = derivePidObservations([readPid(' 01 ', ' 0c ', '850')])

    expect(observations).toHaveLength(1)
    expect(observations[0].code).toBe('01 0C')
  })

  it('should keep the last reading when the same code is read twice', () => {
    const observations = derivePidObservations([
      readPid('01', '0C', '850'),
      readPid('01', '0C', '7000'),
    ])

    expect(observations).toEqual([
      { code: '01 0C', name: 'Régimen del motor', unit: 'rpm', value: 7000, status: 'review' },
    ])
  })

  it('should return an empty list for an empty trace', () => {
    expect(derivePidObservations([])).toEqual([])
  })
})
