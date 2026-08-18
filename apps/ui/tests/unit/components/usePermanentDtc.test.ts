import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiModule from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: {
    getPermanentDtc: vi.fn(),
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

async function loadUsePermanentDtc() {
  const mod = await import('../../../src/components/dashboard/usePermanentDtc')
  return mod.usePermanentDtc
}

describe('usePermanentDtc', () => {
  it('should return empty array and not call api when no scenarioId', async () => {
    const usePermanentDtc = await loadUsePermanentDtc()
    const { result } = renderHook(() => usePermanentDtc('' as string), {
      wrapper: createWrapper(),
    })

    expect(result.current.dtcCodes).toEqual([])
    expect(result.current.loading).toBe(false)
    expect(mockApi.getPermanentDtc).not.toHaveBeenCalled()
  })

  it('should call api.getPermanentDtc and return dtcCodes when scenarioId is set', async () => {
    const dtcCodes = [{ code: 'P0420', description: 'Eficiencia del catalizador' }]
    mockApi.getPermanentDtc.mockResolvedValue({ dtcCodes })

    const usePermanentDtc = await loadUsePermanentDtc()
    const { result } = renderHook(() => usePermanentDtc('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.dtcCodes).toEqual(dtcCodes)
    expect(result.current.error).toBeNull()
  })

  it('should set error when api fails', async () => {
    mockApi.getPermanentDtc.mockRejectedValue(new Error('Not found'))

    const usePermanentDtc = await loadUsePermanentDtc()
    const { result } = renderHook(() => usePermanentDtc('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Not found')
    expect(result.current.dtcCodes).toEqual([])
  })
})
