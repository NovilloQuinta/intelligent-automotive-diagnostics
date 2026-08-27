import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement } from 'react'
import { useDiagnosis } from '../../../src/components/dashboard/useDiagnosis'

vi.mock('../../../src/lib/api', () => ({
  api: {
    runDiagnosis: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { api } from '../../../src/lib/api'
import { toast } from 'sonner'

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return createElement(QueryClientProvider, { client: qc }, children)
}

describe('useDiagnosis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.runDiagnosis).mockRejectedValue(new Error('not called'))
  })

  it('runs diagnosis and returns result', async () => {
    const mockResult = {
      rawData: '{"rpm":750}',
      parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
      dtcCodes: [],
      diagnosisText: '[LOW] No faults',
      severity: 'low' as const,
    }
    vi.mocked(api.runDiagnosis).mockResolvedValueOnce(mockResult)

    const { result } = renderHook(() => useDiagnosis('audi-a3-idle'), {
      wrapper,
    })

    await act(async () => {
      await result.current.runDiagnosis()
    })

    await waitFor(() => {
      expect(result.current.result).toEqual(mockResult)
    })
    expect(result.current.loading).toBe(false)
    expect(api.runDiagnosis).toHaveBeenCalledWith('audi-a3-idle')
  })

  it('does nothing when selectedId is empty', async () => {
    const { result } = renderHook(() => useDiagnosis(''), { wrapper })

    await act(async () => {
      await result.current.runDiagnosis()
    })

    expect(api.runDiagnosis).not.toHaveBeenCalled()
    expect(result.current.result).toBeNull()
  })

  it('sets loading true during diagnosis', async () => {
    vi.mocked(api.runDiagnosis).mockImplementation(() => new Promise(() => {}))

    const { result } = renderHook(() => useDiagnosis('audi-a3-idle'), {
      wrapper,
    })

    act(() => {
      result.current.runDiagnosis()
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(true)
    })
  })

  it('clears result when selectedId changes to a different vehicle', async () => {
    const mockResult = {
      rawData: '{"rpm":750}',
      parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
      dtcCodes: [],
      diagnosisText: '[LOW] No faults',
      severity: 'low' as const,
    }
    vi.mocked(api.runDiagnosis).mockResolvedValue(mockResult)

    const { result, rerender } = renderHook(({ id }) => useDiagnosis(id), {
      initialProps: { id: 'audi-a3-idle' },
      wrapper,
    })

    await act(async () => {
      await result.current.runDiagnosis()
    })

    await waitFor(() => {
      expect(result.current.result).toEqual(mockResult)
    })

    rerender({ id: 'kawa-z900' })

    await waitFor(() => {
      expect(result.current.result).toBeNull()
    })
    expect(result.current.loading).toBe(false)
  })

  it('avisa con un toast de error y el mensaje real cuando el diagnostico falla', async () => {
    vi.mocked(api.runDiagnosis).mockRejectedValueOnce(new Error('ELM327 sin responder'))

    const { result } = renderHook(() => useDiagnosis('audi-a3-idle'), { wrapper })

    await act(async () => {
      await result.current.runDiagnosis().catch(() => undefined)
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error de diagnóstico', {
        description: 'ELM327 sin responder',
      })
    })
    expect(result.current.result).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  // Lo que se lanza en un `catch` no siempre es un Error: sin el respaldo, el
  // mecanico veria `undefined` como descripcion del fallo.
  it('usa el mensaje de respaldo cuando lo lanzado no es un Error', async () => {
    vi.mocked(api.runDiagnosis).mockRejectedValueOnce('boom')

    const { result } = renderHook(() => useDiagnosis('audi-a3-idle'), { wrapper })

    await act(async () => {
      await result.current.runDiagnosis().catch(() => undefined)
    })

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Error de diagnóstico', {
        description: 'Fallo al ejecutar el diagnóstico',
      })
    })
  })

  it('anuncia la severidad en el toast de exito', async () => {
    vi.mocked(api.runDiagnosis).mockResolvedValueOnce({
      rawData: '{}',
      parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
      dtcCodes: [],
      diagnosisText: '[LOW] No faults',
      severity: 'low' as const,
    })

    const { result } = renderHook(() => useDiagnosis('audi-a3-idle'), { wrapper })

    await act(async () => {
      await result.current.runDiagnosis()
    })

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        'Diagnóstico completado',
        expect.objectContaining({ description: expect.stringContaining('Severidad:') }),
      )
    })
  })
})
