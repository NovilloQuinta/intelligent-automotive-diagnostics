import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ---------------------------------------------------------------------------
// Mock the API module
// ---------------------------------------------------------------------------

vi.mock('../../../../src/lib/api', () => ({
  api: {
    getDiagnosisHistoryDetail: vi.fn(),
  },
}))

import { api } from '../../../../src/lib/api'
import { useDiagnosisHistoryDetail } from '../../../../src/components/history/useDiagnosisHistoryDetail'
import type { DiagnosisSessionDetail } from '../../../../src/components/dashboard/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sesion sin snapshot: `resultJson` a null es el caso de una sesion sin informe. */
const SESSION_WITHOUT_REPORT: DiagnosisSessionDetail = {
  id: 7,
  vehicleId: 1,
  scenarioId: 'audi-a3-tdi',
  startedAt: '2026-08-09T10:30:00.000Z',
  endedAt: '2026-08-09T10:31:00.000Z',
  severity: 'high',
  dtcCount: 3,
  resultJson: null,
}

function sessionWithReport(resultJson: string): DiagnosisSessionDetail {
  return { ...SESSION_WITHOUT_REPORT, resultJson }
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useDiagnosisHistoryDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pide el detalle por id y devuelve la sesion', async () => {
    vi.mocked(api.getDiagnosisHistoryDetail).mockResolvedValue(SESSION_WITHOUT_REPORT)

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.session).toEqual(SESSION_WITHOUT_REPORT)
    expect(api.getDiagnosisHistoryDetail).toHaveBeenCalledWith(7)
  })

  it('traduce el snapshot persistido (vehicle/diagnosis/conversation) a SessionReportState', async () => {
    // Forma real de result_json — ver diagnosisSnapshots.ts en el backend, no
    // es un SessionReportState: un cast directo dejaba `cognitive` siempre
    // undefined y el informe historico se quedaba "esperando" para siempre.
    const snapshot = {
      vehicle: { vin: 'WAUZZZ8V5JA123456', make: 'Audi', model: 'A3' },
      diagnosis: {
        severity: 'high',
        confidence: 0.8,
        narrative: 'Fallo de encendido en cilindro 1.',
        recommendations: ['Revisar bujías'],
        toolCalls: [],
      },
      conversation: [],
      timestamp: '2026-08-09T10:31:00.000Z',
    }
    vi.mocked(api.getDiagnosisHistoryDetail).mockResolvedValue(
      sessionWithReport(JSON.stringify(snapshot)),
    )

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.reportState).not.toBeNull()
    })

    expect(result.current.reportState).toEqual({
      capabilities: { cognitiveDiagnosis: true },
      deterministic: null,
      deterministicLoading: false,
      deterministicError: null,
      ecus: null,
      ecusLoading: false,
      freezeFrame: null,
      freezeFrameLoading: false,
      cognitive: {
        diagnosis: 'Fallo de encendido en cilindro 1.',
        severity: 'high',
        confidence: 0.8,
        recommendations: ['Revisar bujías'],
        toolCalls: [],
        pidObservations: [],
      },
      cognitiveLoading: false,
      cognitiveError: null,
    })
  })

  it('deja `reportState` en null cuando el snapshot no trae diagnostico cognitivo', async () => {
    vi.mocked(api.getDiagnosisHistoryDetail).mockResolvedValue(
      sessionWithReport(JSON.stringify({ vehicle: { make: 'Audi' } })),
    )

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.reportState).toBeNull()
  })

  // Es la rama que documenta el TSDoc del hook: un snapshot corrupto no debe
  // tumbar la pantalla de detalle, solo dejarla sin informe.
  it('con `resultJson` corrupto devuelve la sesion y `reportState` a null', async () => {
    vi.mocked(api.getDiagnosisHistoryDetail).mockResolvedValue(
      sessionWithReport('{ esto no es JSON'),
    )

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.session).not.toBeNull()
    })

    expect(result.current.reportState).toBeNull()
    expect(result.current.isError).toBe(false)
  })

  it('sin `resultJson` deja `reportState` a null', async () => {
    vi.mocked(api.getDiagnosisHistoryDetail).mockResolvedValue(SESSION_WITHOUT_REPORT)

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.session).not.toBeNull()
    })

    expect(result.current.reportState).toBeNull()
  })

  it('con id no valido no llama a la API', async () => {
    const { result } = renderHook(() => useDiagnosisHistoryDetail(0), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(api.getDiagnosisHistoryDetail).not.toHaveBeenCalled()
    expect(result.current.session).toBeNull()
  })

  it('expone isError y error cuando la API falla', async () => {
    vi.mocked(api.getDiagnosisHistoryDetail).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useDiagnosisHistoryDetail(7), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe('Network error')
  })
})
