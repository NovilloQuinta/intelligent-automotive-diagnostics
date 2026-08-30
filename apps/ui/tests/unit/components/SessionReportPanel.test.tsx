import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionReportPanel } from '../../../src/components/dashboard/SessionReportPanel'
import type { SessionReportState } from '../../../src/components/dashboard/useSessionReport'
import type {
  DiagnosisResponse,
  EcuInfo,
  FreezeFrame,
} from '../../../src/components/dashboard/types'
import type { CognitiveOutput } from '../../../src/lib/api'

// ---------------------------------------------------------------------------
// Mock useSessionReport hook — test boundary
// ---------------------------------------------------------------------------

const { mockUseSessionReport } = vi.hoisted(() => ({
  mockUseSessionReport: vi.fn(),
}))

vi.mock('../../../src/components/dashboard/useSessionReport', () => ({
  useSessionReport: mockUseSessionReport,
}))

const { mockUseAvailablePids } = vi.hoisted(() => ({
  mockUseAvailablePids: vi.fn(),
}))

vi.mock('../../../src/components/dashboard/useAvailablePids', () => ({
  useAvailablePids: mockUseAvailablePids,
}))

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const sampleDtcCodes: DiagnosisResponse['dtcCodes'] = [
  { code: 'P0301', description: 'Cilindro 1 — fallo de encendido' },
  { code: 'P0135', description: 'Sensor O2 — circuito calefactor' },
]

const sampleDeterministic: DiagnosisResponse = {
  rawData: '41 0C 1A F8',
  parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 28 },
  dtcCodes: sampleDtcCodes,
  diagnosisText: 'Fallo de encendido detectado en cilindro 1.',
  severity: 'high',
}

const sampleEcus: EcuInfo[] = [
  {
    id: 1,
    vehicleId: 0,
    name: 'Engine Control Unit',
    requestAddr: '7E0',
    responseAddr: '7E8',
    type: 'ECM',
    protocol: 'ISO 15765-4 (CAN 11/500)',
  },
]

const sampleFreezeFrame: FreezeFrame = {
  dtcCode: 'P0301',
  pidValues: { '0C': 850, '05': 90 },
}

const sampleCognitiveOutputWithTools: CognitiveOutput = {
  diagnosis: 'El fallo de encendido en el cilindro 1 sugiere problemas con bujía o bobina.',
  severity: 'high',
  confidence: 0.92,
  recommendations: ['Inspeccionar bujía del cilindro 1', 'Verificar bobina de encendido'],
  toolCalls: [
    {
      tool: 'search_knowledge_base',
      args: { query: 'P0301 causas comunes' },
      result: 'Documento: P0301 típicamente causado por bujías desgastadas.',
    },
  ],
}

const sampleCognitiveOutputNoTools: CognitiveOutput = {
  diagnosis: 'Diagnóstico rápido sin herramientas externas.',
  severity: 'low',
  confidence: 0.65,
  recommendations: ['Revisar estado general del motor.'],
  toolCalls: [],
}

const sampleVehicleInfo = {
  make: 'Audi',
  model: 'A3',
  year: 2020,
  engineType: '2.0 TFSI',
  vin: 'WAUZZZ8V5LA123456',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PartialState {
  readonly deterministic?: DiagnosisResponse | null
  readonly deterministicLoading?: boolean
  readonly deterministicError?: string | null
  readonly ecus?: EcuInfo[] | null
  readonly ecusLoading?: boolean
  readonly freezeFrame?: FreezeFrame | null
  readonly freezeFrameLoading?: boolean
  readonly cognitive?: CognitiveOutput | 'unavailable' | null
  readonly cognitiveLoading?: boolean
  readonly cognitiveError?: string | null
  readonly capabilities?: { cognitiveDiagnosis: boolean } | null
}

const defaultState: SessionReportState = {
  capabilities: { cognitiveDiagnosis: true },
  deterministic: null,
  deterministicLoading: false,
  deterministicError: null,
  ecus: null,
  ecusLoading: false,
  freezeFrame: null,
  freezeFrameLoading: false,
  cognitive: null,
  cognitiveLoading: false,
  cognitiveError: null,
}

function setState(overrides: PartialState): SessionReportState {
  return { ...defaultState, ...overrides }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SessionReportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSessionReport.mockReturnValue(defaultState)
    mockUseAvailablePids.mockReturnValue([])
  })

  // ------------------------------------------------------------------
  // 1. Header + DTCs + deterministic severity renders immediately
  // ------------------------------------------------------------------

  it('should render header with vehicle info, DTCs, and severity when deterministic data is available', () => {
    mockUseSessionReport.mockReturnValue(setState({ deterministic: sampleDeterministic }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Vehicle info header
    expect(screen.getByText(/Audi/)).toBeDefined()
    expect(screen.getByText(/A3/)).toBeDefined()
    expect(screen.getByText(/WAUZZZ8V5LA123456/)).toBeDefined()

    // DTC codes
    expect(screen.getByText('P0301')).toBeDefined()
    expect(screen.getByText('Cilindro 1 — fallo de encendido')).toBeDefined()
    expect(screen.getByText('P0135')).toBeDefined()

    // Severity badge (ALTA for "high")
    expect(screen.getByText('ALTA')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 2. Deterministic error
  // ------------------------------------------------------------------

  it('should render deterministic error message with heading present', () => {
    mockUseSessionReport.mockReturnValue(setState({ deterministicError: 'Error en diagnóstico' }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Diagnostic heading should still render
    expect(screen.getByText('Diagnóstico Determinista')).toBeDefined()
    // Error message shown
    expect(screen.getByText('Error en diagnóstico')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 3. Cognitive section loading
  // ------------------------------------------------------------------

  it('should show cognitive loading state while cognitive promise is pending', () => {
    mockUseSessionReport.mockReturnValue(setState({ cognitiveLoading: true }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Cognitive heading renders
    expect(screen.getByText('Diagnóstico Cognitivo')).toBeDefined()
    // Loading indicator visible
    expect(screen.getByText('Analizando con IA…')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 4. Cognitive section "not available"
  // ------------------------------------------------------------------

  it('should show "cognitive not available" when cognitiveDiagnosis is false', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        capabilities: { cognitiveDiagnosis: false },
        cognitive: 'unavailable',
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('Diagnóstico Cognitivo')).toBeDefined()
    expect(screen.getByText('Diagnóstico cognitivo no disponible')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 5. Cognitive section with data: narrative + badges + recommendations
  // ------------------------------------------------------------------

  it('should render cognitive result with narrative, severity badge, confidence, and recommendations', () => {
    mockUseSessionReport.mockReturnValue(setState({ cognitive: sampleCognitiveOutputNoTools }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Narrative
    expect(screen.getByText('Diagnóstico rápido sin herramientas externas.')).toBeDefined()
    // Severity translated: "low" → "BAJA"
    expect(screen.getByText('BAJA')).toBeDefined()
    // Confidence (text split across nodes: "Confianza: " + "65" + " %")
    expect(screen.getByText(/Confianza: 65\s*%/)).toBeDefined()
    // Recommendation
    expect(screen.getByText('Revisar estado general del motor.')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 6. Cognitive section error
  // ------------------------------------------------------------------

  it('should render cognitive error message when cognitive fails', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        cognitiveError: 'Error en diagnóstico cognitivo',
        cognitiveLoading: false,
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('Error en diagnóstico cognitivo')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 7. Tool trace collapsed by default, expandable on click
  // ------------------------------------------------------------------

  it('should render toolCalls trace collapsed by default and expand on click', () => {
    mockUseSessionReport.mockReturnValue(setState({ cognitive: sampleCognitiveOutputWithTools }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Trace trigger (collapsed, so no tool result visible)
    const trigger = screen.getByText(/Traza de herramientas/)
    expect(trigger).toBeDefined()
    expect(
      screen.queryByText('Documento: P0301 típicamente causado por bujías desgastadas.'),
    ).toBeNull()

    // Expand
    fireEvent.click(trigger)
    expect(
      screen.getByText('Documento: P0301 típicamente causado por bujías desgastadas.'),
    ).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 8. ECU and freeze frame sections absent when data is null
  // ------------------------------------------------------------------

  it('should not render ECU or freeze frame sections when their data is null', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        ecus: null,
        ecusLoading: false,
        freezeFrame: null,
        freezeFrameLoading: false,
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // The sections should not be in the DOM
    expect(screen.queryByText('ECUs Descubiertas')).toBeNull()
    expect(screen.queryByText('Freeze Frame')).toBeNull()
  })

  // ------------------------------------------------------------------
  // 9. ECU section renders when data is available
  // ------------------------------------------------------------------

  it('should render ECU section when ECU data is available', () => {
    mockUseSessionReport.mockReturnValue(setState({ ecus: sampleEcus, ecusLoading: false }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('ECUs Descubiertas')).toBeDefined()
    expect(screen.getByText('Engine Control Unit')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 10. Freeze frame section renders when data is available
  // ------------------------------------------------------------------

  it('should render freeze frame section when freeze frame data is available', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        freezeFrame: sampleFreezeFrame,
        freezeFrameLoading: false,
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('Freeze Frame')).toBeDefined()
    expect(screen.getByText('P0301')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 10b. Freeze frame renders name + unit when the PID catalog is available
  // ------------------------------------------------------------------

  it('should render freeze frame PIDs by name + unit when the catalog is available', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        freezeFrame: sampleFreezeFrame,
        freezeFrameLoading: false,
      }),
    )
    mockUseAvailablePids.mockReturnValue([
      { code: '01 0C', name: 'Engine RPM', unit: 'rpm' },
      { code: '01 05', name: 'Coolant Temperature', unit: '°C' },
    ])

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('Engine RPM')).toBeDefined()
    expect(screen.getByText('850 rpm')).toBeDefined()
    expect(screen.getByText('Coolant Temperature')).toBeDefined()
    expect(screen.getByText('90 °C')).toBeDefined()
    expect(screen.queryByText('0C')).toBeNull()
  })

  // ------------------------------------------------------------------
  // 11. Show vehicle missing message when vehicleInfo is not provided
  // ------------------------------------------------------------------

  it("should show 'vehicle info missing' when vehicleInfo prop is not provided", () => {
    mockUseSessionReport.mockReturnValue(setState({ deterministic: sampleDeterministic }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" />)

    expect(screen.getByText('Información del vehículo no disponible')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 12. Snapshot mode — no network requests (6.1)
  // ------------------------------------------------------------------

  it('should not call useSessionReport when snapshot is provided', () => {
    const snapshot: SessionReportState = setState({
      deterministic: sampleDeterministic,
      ecus: sampleEcus,
    })

    // Clear mock first to verify it's NOT called
    mockUseSessionReport.mockClear()

    render(<SessionReportPanel snapshot={snapshot} vehicleInfo={sampleVehicleInfo} />)

    // The mock should NOT have been called
    expect(mockUseSessionReport).not.toHaveBeenCalled()
    // But the data should render
    expect(screen.getByText('Diagnóstico Determinista')).toBeDefined()
    expect(screen.getByText('P0301')).toBeDefined()
    expect(screen.getByText('Engine Control Unit')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 13. Without snapshot — behaves as today (6.3)
  // ------------------------------------------------------------------

  it('should call useSessionReport when snapshot is not provided (live mode)', () => {
    mockUseSessionReport.mockReturnValue(setState({ deterministic: sampleDeterministic }))

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(mockUseSessionReport).toHaveBeenCalledWith('audi-a3-idle', undefined, undefined)
    expect(screen.getByText('Diagnóstico Determinista')).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 14. Historical report shows generation date (6.4)
  // ------------------------------------------------------------------

  it('should display generation date when generatedAt prop is provided', () => {
    const snapshot: SessionReportState = setState({
      deterministic: sampleDeterministic,
    })

    render(
      <SessionReportPanel
        snapshot={snapshot}
        vehicleInfo={sampleVehicleInfo}
        generatedAt="2026-08-09T10:30:00.000Z"
      />,
    )

    // Should show the generation date
    expect(screen.getByText(/generado el 9 de agosto de 2026/i)).toBeDefined()
  })

  // ------------------------------------------------------------------
  // 12. Cognitive severity comes from the backend enum, in English
  // ------------------------------------------------------------------

  it('should translate the backend severity enum instead of leaking it raw', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        cognitive: { ...sampleCognitiveOutputNoTools, severity: 'critical' },
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    expect(screen.getByText('CRÍTICO')).toBeDefined()
    expect(screen.queryByText('CRITICAL')).toBeNull()
  })

  it('should not render two different severities the same way', () => {
    mockUseSessionReport.mockReturnValue(
      setState({
        cognitive: { ...sampleCognitiveOutputNoTools, severity: 'high' },
      }),
    )

    render(<SessionReportPanel scenarioId="audi-a3-idle" vehicleInfo={sampleVehicleInfo} />)

    // Con el mapa en espanol, "high" caia al mismo respaldo que cualquier otro
    // valor desconocido: severidades distintas se pintaban igual.
    expect(screen.getByText('ALTA')).toBeDefined()
    expect(screen.queryByText('HIGH')).toBeNull()
  })
})
