import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAnimatedNumber } from '../../../src/components/dashboard/useAnimatedNumber'

// Deterministic animation driver: the hook's only timing inputs are
// performance.now() (read once per effect for `startRef`) and the
// requestAnimationFrame callback timestamp, so we stub both and drive
// frames manually with explicit timestamps.
let rafCb: ((ts: number) => void) | null = null
let rafCounter: number
let cancelAnimationFrameSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  rafCb = null
  rafCounter = 0
  vi.stubGlobal('performance', { now: () => 0 })
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((cb: (ts: number) => void) => {
      rafCb = cb
      return ++rafCounter
    }),
  )
  cancelAnimationFrameSpy = vi.fn()
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameSpy)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function driveFrame(ts: number): void {
  act(() => {
    const cb = rafCb
    rafCb = null
    expect(cb).not.toBeNull()
    cb!(ts)
  })
}

describe('useAnimatedNumber', () => {
  it('stays at 0 when target is null', () => {
    const { result } = renderHook(() => useAnimatedNumber(null))

    expect(result.current).toBe(0)
    // No animation scheduled
    expect(rafCb).toBeNull()
    expect(cancelAnimationFrameSpy).not.toHaveBeenCalled()
  })

  it('animates from the current value toward the target', () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useAnimatedNumber(target),
      { initialProps: { target: null } },
    )
    expect(result.current).toBe(0)

    rerender({ target: 500 })
    expect(rafCb).not.toBeNull()

    // Halfway (200ms of 400ms): cubic ease-out → 1 - (1 - 0.5)^3 = 0.875
    driveFrame(200)
    expect(result.current).toBeCloseTo(500 * 0.875)
    // Not done yet — a new frame is scheduled
    expect(rafCb).not.toBeNull()

    // Full duration: converges exactly and stops scheduling frames
    driveFrame(400)
    expect(result.current).toBe(500)
    expect(rafCb).toBeNull()
  })

  it('restarts the animation when the target changes', () => {
    const { result, rerender } = renderHook(
      ({ target }: { target: number | null }) => useAnimatedNumber(target),
      { initialProps: { target: null } },
    )

    rerender({ target: 500 })
    driveFrame(400)
    expect(result.current).toBe(500)

    // New target → new animation from 500 toward 100; the pending frame of
    // the previous animation is cancelled
    rerender({ target: 100 })
    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)

    driveFrame(200)
    expect(result.current).toBeCloseTo(500 + (100 - 500) * 0.875)

    driveFrame(400)
    expect(result.current).toBe(100)
    expect(rafCb).toBeNull()
  })

  it('cancels the pending animation frame on unmount', () => {
    const { unmount } = renderHook(() => useAnimatedNumber(500))

    unmount()

    expect(cancelAnimationFrameSpy).toHaveBeenCalledTimes(1)
  })
})
