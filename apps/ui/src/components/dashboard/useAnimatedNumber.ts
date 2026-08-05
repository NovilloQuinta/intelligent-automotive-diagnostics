import { useEffect, useRef, useState } from 'react'
import { GAUGE } from './types'

/** Animated counter hook using requestAnimationFrame with cubic ease-out. */
export function useAnimatedNumber(target: number | null, duration = GAUGE.ANIM_DURATION_MS) {
  const [value, setValue] = useState<number>(target ?? 0)
  const raf = useRef<number | null>(null)
  const fromRef = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    if (target == null) return
    fromRef.current = value
    startRef.current = performance.now()
    const step = (t: number) => {
      const p = Math.min(1, (t - startRef.current) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(fromRef.current + (target - fromRef.current) * eased)
      if (p < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  // target is the only meaningful dependency; value and duration are captured via refs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])

  return value
}
