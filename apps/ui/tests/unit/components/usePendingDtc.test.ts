import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiModule from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: {
    getPendingDtc: vi.fn(),
  },
}))

const mockApi = vi.mocked(apiModule.api)

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

async function loadUsePendingDtc() {
  const mod = await import('../../../src/components/dashboard/usePendingDtc')
  return mod.usePendingDtc
}

describe('usePendingDtc', () => {
  it('should return empty array and not call api when no scenarioId', async () => {
    const usePendingDtc = await loadUsePendingDtc()
    const { result } = renderHook(() => usePendingDtc('' as string), {
      wrapper: createWrapper(),
    })

    expect(result.current.dtcCodes).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(mockApi.getPendingDtc).not.toHaveBeenCalled()
  })

  it('should call api.getPendingDtc and return dtcCodes when scenarioId is set', async () => {
    const dtcCodes = [{ code: 'P0301', description: 'Cilindro 1: fallo de encendido' }]
    mockApi.getPendingDtc.mockResolvedValue({ dtcCodes })

    const usePendingDtc = await loadUsePendingDtc()
    const { result } = renderHook(() => usePendingDtc('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dtcCodes).toEqual(dtcCodes)
    expect(result.current.error).toBeNull()
  })

  it('should set error when api fails', async () => {
    mockApi.getPendingDtc.mockRejectedValue(new Error('Not found'))

    const usePendingDtc = await loadUsePendingDtc()
    const { result } = renderHook(() => usePendingDtc('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Not found')
    expect(result.current.dtcCodes).toEqual([])
  })
})
