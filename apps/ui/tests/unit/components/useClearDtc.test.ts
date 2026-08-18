import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import * as apiModule from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: {
    clearDtc: vi.fn(),
  },
}))

const mockApi = vi.mocked(apiModule.api)

async function loadUseClearDtc() {
  const mod = await import('../../../src/components/dashboard/useClearDtc')
  return mod.useClearDtc
}

describe('useClearDtc', () => {
  it('should return initial state with loading=false', async () => {
    const useClearDtc = await loadUseClearDtc()
    const { result } = renderHook(() => useClearDtc())

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should call api.clearDtc and return cleared=true on success', async () => {
    mockApi.clearDtc.mockResolvedValue({ cleared: true })

    const useClearDtc = await loadUseClearDtc()
    const { result } = renderHook(() => useClearDtc())

    let clearedResult: boolean | undefined
    await act(async () => {
      clearedResult = await result.current.clearDtc('audi-a3-idle')
    })

    expect(clearedResult).toBe(true)
    expect(mockApi.clearDtc).toHaveBeenCalledWith('audi-a3-idle')
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('should return cleared=false when the backend reports not cleared', async () => {
    mockApi.clearDtc.mockResolvedValue({ cleared: false })

    const useClearDtc = await loadUseClearDtc()
    const { result } = renderHook(() => useClearDtc())

    let clearedResult: boolean | undefined
    await act(async () => {
      clearedResult = await result.current.clearDtc('audi-a3-idle')
    })

    expect(clearedResult).toBe(false)
  })

  it('should set error when api fails', async () => {
    mockApi.clearDtc.mockRejectedValue(new Error('OBD timeout'))

    const useClearDtc = await loadUseClearDtc()
    const { result } = renderHook(() => useClearDtc())

    await act(async () => {
      try {
        await result.current.clearDtc('audi-a3-idle')
      } catch {
        // expected
      }
    })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('OBD timeout')
  })
})
