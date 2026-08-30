import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { ApiHttpError } from '../../../src/lib/api-errors'
import type { CognitiveOutput } from '../../../src/lib/api'

// ---------------------------------------------------------------------------
// Mock the API module — all methods are vi.fn() for full control
// ---------------------------------------------------------------------------

vi.mock('../../../src/lib/api', () => ({
  api: {
    getCapabilities: vi.fn(),
    runDiagnosis: vi.fn(),
    getEcuInfo: vi.fn(),
    getFreezeFrame: vi.fn(),
    getCognitiveDiagnosis: vi.fn(),
  },
}))

import { api } from '../../../src/lib/api'
import { useSessionReport } from '../../../src/components/dashboard/useSessionReport'

import type {
  DiagnosisResponse,
  EcuInfo,
  FreezeFrame,
} from '../../../src/components/dashboard/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAMPLE_DIAGNOSIS: DiagnosisResponse = {
  rawData: '{"rpm":750}',
  parsedValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
  dtcCodes: [],
  diagnosisText: '[LOW] No faults',
  severity: 'low',
}

const SAMPLE_ECUS: EcuInfo[] = [
  {
    id: 1,
    vehicleId: 1,
    name: 'Engine Control Unit',
    requestAddr: '7E0',
    responseAddr: '7E8',
    type: 'ECM',
    protocol: 'ISO 15765-4 (CAN 11/500)',
  },
]

const SAMPLE_FREEZE_FRAME: FreezeFrame = {
  dtcCode: 'P0301',
  pidValues: { rpm: 1500, speed: 60 },
}

const SAMPLE_COGNITIVE: CognitiveOutput = {
  diagnosis: 'Misfire detected in cylinder 1',
  severity: 'high',
  confidence: 0.92,
  recommendations: ['Check spark plug', 'Inspect ignition coil'],
  toolCalls: [],
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useSessionReport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Test 1: Parallel fire of all four calls ----

  it('should fire runDiagnosis, getEcuInfo, getFreezeFrame and getCognitiveDiagnosis when cognitive is available', async () => {
    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: true,
    })
    vi.mocked(api.runDiagnosis).mockResolvedValue(SAMPLE_DIAGNOSIS)
    vi.mocked(api.getEcuInfo).mockResolvedValue(SAMPLE_ECUS)
    vi.mocked(api.getFreezeFrame).mockResolvedValue(SAMPLE_FREEZE_FRAME)
    vi.mocked(api.getCognitiveDiagnosis).mockResolvedValue(SAMPLE_COGNITIVE)

    renderHook(() => useSessionReport('scenario-1'))

    await waitFor(() => {
      expect(api.runDiagnosis).toHaveBeenCalledWith('scenario-1')
      expect(api.getEcuInfo).toHaveBeenCalledWith('scenario-1')
      expect(api.getFreezeFrame).toHaveBeenCalledWith('scenario-1', undefined)
      expect(api.getCognitiveDiagnosis).toHaveBeenCalledWith('scenario-1')
    })
  })

  // ---- Test 2: Deterministic data available before cognitive resolves ----

  it('should make deterministic data available before cognitive call resolves', async () => {
    // Deferred promises to control resolution order
    let resolveDiagnosis!: (value: DiagnosisResponse) => void
    const diagnosisPromise = new Promise<DiagnosisResponse>((r) => {
      resolveDiagnosis = r
    })

    let resolveCognitive!: (value: CognitiveOutput) => void
    const cognitivePromise = new Promise<CognitiveOutput>((r) => {
      resolveCognitive = r
    })

    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: true,
    })
    vi.mocked(api.runDiagnosis).mockReturnValue(diagnosisPromise)
    vi.mocked(api.getEcuInfo).mockResolvedValue(SAMPLE_ECUS)
    vi.mocked(api.getFreezeFrame).mockResolvedValue(SAMPLE_FREEZE_FRAME)
    vi.mocked(api.getCognitiveDiagnosis).mockReturnValue(cognitivePromise)

    const { result } = renderHook(() => useSessionReport('scenario-1'))

    // Resolve deterministic diagnosis first
    await act(async () => {
      resolveDiagnosis(SAMPLE_DIAGNOSIS)
    })

    // Deterministic should now be set while cognitive is still loading
    await waitFor(() => {
      expect(result.current.deterministic).toEqual(SAMPLE_DIAGNOSIS)
      expect(result.current.deterministicLoading).toBe(false)
    })
    // Cognitive should still be loading
    expect(result.current.cognitiveLoading).toBe(true)
    expect(result.current.cognitive).toBeNull()

    // Now resolve cognitive
    await act(async () => {
      resolveCognitive(SAMPLE_COGNITIVE)
    })

    await waitFor(() => {
      expect(result.current.cognitive).toEqual(SAMPLE_COGNITIVE)
      expect(result.current.cognitiveLoading).toBe(false)
    })
  })

  // ---- Test 3: cognitiveDiagnosis: false → cognitive = 'unavailable' ----

  it("should mark cognitive as 'unavailable' and skip getCognitiveDiagnosis when capabilities say false", async () => {
    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: false,
    })
    vi.mocked(api.runDiagnosis).mockResolvedValue(SAMPLE_DIAGNOSIS)
    vi.mocked(api.getEcuInfo).mockResolvedValue(SAMPLE_ECUS)
    vi.mocked(api.getFreezeFrame).mockResolvedValue(SAMPLE_FREEZE_FRAME)

    const { result } = renderHook(() => useSessionReport('scenario-1'))

    await waitFor(() => {
      expect(result.current.capabilities).toEqual({
        cognitiveDiagnosis: false,
      })
    })

    // Cognitive should be 'unavailable' and the call must never have been made
    expect(result.current.cognitive).toBe('unavailable')
    expect(api.getCognitiveDiagnosis).not.toHaveBeenCalled()
  })

  // ---- Test 4: 404 from ecu-info/freeze-frame → section = null, no global error ----

  it('should set ecus and freezeFrame to null on 404 without setting a global error', async () => {
    const notFoundError = new ApiHttpError('Not Found', 404)

    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: false,
    })
    vi.mocked(api.runDiagnosis).mockResolvedValue(SAMPLE_DIAGNOSIS)
    vi.mocked(api.getEcuInfo).mockRejectedValue(notFoundError)
    vi.mocked(api.getFreezeFrame).mockRejectedValue(notFoundError)

    const { result } = renderHook(() => useSessionReport('scenario-1'))

    await waitFor(() => {
      expect(result.current.ecusLoading).toBe(false)
      expect(result.current.freezeFrameLoading).toBe(false)
    })

    expect(result.current.ecus).toBeNull()
    expect(result.current.freezeFrame).toBeNull()
    // No global error — deterministic should be fine
    expect(result.current.deterministic).toEqual(SAMPLE_DIAGNOSIS)
    expect(result.current.deterministicError).toBeNull()
  })

  // ---- Test 5: 5xx in deterministic diagnosis → visible error state ----

  it('should set deterministicError when deterministic diagnosis fails with a 5xx error', async () => {
    const serverError = new ApiHttpError('Internal Server Error', 500)

    vi.mocked(api.getCapabilities).mockResolvedValue({
      cognitiveDiagnosis: false,
    })
    vi.mocked(api.runDiagnosis).mockRejectedValue(serverError)
    vi.mocked(api.getEcuInfo).mockResolvedValue(SAMPLE_ECUS)
    vi.mocked(api.getFreezeFrame).mockResolvedValue(SAMPLE_FREEZE_FRAME)

    const { result } = renderHook(() => useSessionReport('scenario-1'))

    await waitFor(() => {
      expect(result.current.deterministicLoading).toBe(false)
    })

    expect(result.current.deterministic).toBeNull()
    expect(result.current.deterministicError).not.toBeNull()
    expect(result.current.deterministicError).toBe('Internal Server Error')
  })
})
