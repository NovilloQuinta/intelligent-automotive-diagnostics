import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useVehicleStatus } from '../../../src/components/dashboard/useVehicleStatus'
import * as apiModule from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: {
    getVehicleStatus: vi.fn(),
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

describe('useVehicleStatus', () => {
  it('should return null status and not call api when no scenarioId', () => {
    const { result } = renderHook(() => useVehicleStatus(null), {
      wrapper: createWrapper(),
    })

    expect(result.current.status).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(mockApi.getVehicleStatus).not.toHaveBeenCalled()
  })

  it('should call api.getVehicleStatus and return status when scenarioId is set', async () => {
    const sampleStatus = {
      milOn: true,
      dtcCount: 3,
      engineType: 'spark' as const,
      monitors: [
        { name: 'misfire', supported: true, completed: true },
        { name: 'catalyst', supported: true, completed: false },
        { name: 'egrSystem', supported: false, completed: false },
      ],
    }
    mockApi.getVehicleStatus.mockResolvedValue(sampleStatus)

    const { result } = renderHook(() => useVehicleStatus('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.status).toEqual(sampleStatus)
    expect(result.current.error).toBeNull()
  })

  it('should set error when api fails', async () => {
    mockApi.getVehicleStatus.mockRejectedValue(new Error('Not found'))

    const { result } = renderHook(() => useVehicleStatus('audi-a3-idle'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Not found')
    expect(result.current.status).toBeNull()
  })
})
