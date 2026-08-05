import { useEffect, useState } from 'react'
import type { LiveFrame } from './types'

/** Subscribes to the SSE telemetry stream for the given scenario. */
export function useLiveTelemetry(selectedId: string) {
  const [live, setLive] = useState<LiveFrame | null>(null)
  const [streamOk, setStreamOk] = useState(false)

  useEffect(() => {
    if (!selectedId) return
    setLive(null)
    setStreamOk(false)
    const es = new EventSource(`/api/telemetry/${encodeURIComponent(selectedId)}`)
    es.addEventListener('open', () => setStreamOk(true))
    es.addEventListener('tick', (ev) => {
      try {
        setLive(JSON.parse((ev as MessageEvent).data) as LiveFrame)
        setStreamOk(true)
      } catch { /* malformed SSE frame — skip */ }
    })
    es.onerror = () => setStreamOk(false)
    return () => { es.close(); setStreamOk(false) }
  }, [selectedId])

  return { live, streamOk }
}
