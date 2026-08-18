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

import { api } from '../../../src/lib/api'

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
})
