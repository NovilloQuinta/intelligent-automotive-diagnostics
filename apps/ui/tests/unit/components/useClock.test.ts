import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useClock } from '../../../src/components/dashboard/useClock'

describe('useClock', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the current date on mount', () => {
    const { result } = renderHook(() => useClock())

    expect(result.current).toBeInstanceOf(Date)
  })

  it('updates the date every second', () => {
    const { result } = renderHook(() => useClock())

    const initial = result.current!.getTime()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current!.getTime()).toBe(initial + 1000)

    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current!.getTime()).toBe(initial + 3000)
  })

  it('clears the interval on unmount', () => {
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
    const { unmount } = renderHook(() => useClock())

    unmount()

    expect(clearIntervalSpy).toHaveBeenCalled()
  })
})
