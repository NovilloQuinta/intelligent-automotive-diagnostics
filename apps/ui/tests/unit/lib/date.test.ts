import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { computeDateRange } from '../../../src/lib/date'

describe('computeDateRange', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-08-10T15:30:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should return from=start of today and to=now for "today" shortcut', () => {
    const result = computeDateRange('today')
    expect(result.from).toBe('2026-08-10T00:00:00.000Z')
    expect(result.to).toBe('2026-08-10T15:30:00.000Z')
  })

  it('should return from=7 days ago at midnight for "7d" shortcut', () => {
    const result = computeDateRange('7d')
    expect(result.from).toBe('2026-08-03T00:00:00.000Z')
    expect(result.to).toBe('2026-08-10T15:30:00.000Z')
  })

  it('should return from=30 days ago at midnight for "30d" shortcut', () => {
    const result = computeDateRange('30d')
    expect(result.from).toBe('2026-07-11T00:00:00.000Z')
    expect(result.to).toBe('2026-08-10T15:30:00.000Z')
  })
})
