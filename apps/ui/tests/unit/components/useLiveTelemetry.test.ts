import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, useState } from 'react'

vi.mock('../../../src/lib/api', () => ({
  api: { getLiveData: vi.fn() },
}))

import { api } from '../../../src/lib/api'
import { useLiveTelemetry } from '../../../src/components/dashboard/useLiveTelemetry'

/** Un QueryClient por montaje, no uno nuevo en cada render. */
function wrapper({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }))
  return createElement(QueryClientProvider, { client: qc }, children)
}

const mockLiveData = {
  rpm: 800,
  coolantTemp: 90,
  speed: 0,
  intakeTemp: 35,
  readings: [],
}

describe('useLiveTelemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * El test previo mockeaba `globalThis.fetch`, y por eso no detecto que el hook
   * llamaba al endpoint sin cabecera Authorization: al sustituir `fetch` no queda
   * nada que compruebe la autenticacion. Mockear el cliente `api` obliga a pasar
   * por `apiFetch`, que es quien pone el token y lo renueva al caducar.
   */
  it('lee la telemetria a traves del cliente api, no con fetch directo', async () => {
    vi.mocked(api.getLiveData).mockResolvedValue(mockLiveData)

    const { result } = renderHook(() => useLiveTelemetry('audi-a3'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.streamOk).toBe(true)
    })
    expect(api.getLiveData).toHaveBeenCalledWith('audi-a3')
    expect(result.current.live).toEqual({
      rpm: 800,
      coolantTemp: 90,
      speed: 0,
      intakeTemp: 35,
      rawData: '',
      ts: expect.any(Number),
    })
  })

  it('un PID a null cae a 0 sin arrastrar a los demas', async () => {
    vi.mocked(api.getLiveData).mockResolvedValue({
      rpm: null,
      coolantTemp: 90,
      speed: null,
      intakeTemp: 35,
    })

    const { result } = renderHook(() => useLiveTelemetry('audi-a3'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.live).not.toBeNull()
    })
    expect(result.current.live!.rpm).toBe(0)
    expect(result.current.live!.speed).toBe(0)
    expect(result.current.live!.coolantTemp).toBe(90)
  })

  it('streamOk queda en false si la lectura falla', async () => {
    vi.mocked(api.getLiveData).mockRejectedValue(new Error('fail'))

    const { result } = renderHook(() => useLiveTelemetry('audi-a3'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.streamOk).toBe(false)
    })
  })

  it('un 401 deja streamOk en false y no rompe el dashboard', async () => {
    vi.mocked(api.getLiveData).mockRejectedValue(new Error('Unauthorized'))

    const { result } = renderHook(() => useLiveTelemetry('audi-a3'), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.streamOk).toBe(false)
    })
    expect(result.current.live).toBeNull()
  })

  it('sin vehiculo seleccionado no consulta nada', () => {
    const { result } = renderHook(() => useLiveTelemetry(''), { wrapper })

    expect(result.current.live).toBeNull()
    expect(result.current.streamOk).toBe(false)
    expect(api.getLiveData).not.toHaveBeenCalled()
  })

  it('pasa los pids al cliente api y expone las readings', async () => {
    const readings = [{ code: '01 11', name: 'Posición del acelerador', unit: '%', value: 14 }]
    vi.mocked(api.getLiveData).mockResolvedValue({ ...mockLiveData, readings })

    const { result } = renderHook(() => useLiveTelemetry('audi-a3', ['0C', '0D']), {
      wrapper,
    })

    await waitFor(() => {
      expect(result.current.streamOk).toBe(true)
    })
    expect(api.getLiveData).toHaveBeenCalledWith('audi-a3', ['0C', '0D'])
    expect(result.current.readings).toEqual(readings)
  })
})
