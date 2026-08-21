import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { Scenario } from '../../../src/components/dashboard/types'

const {
  mockAuthStatus,
  mockLogout,
  mockUseScenarios,
  mockUseLiveTelemetry,
  mockUseDiagnosis,
  mockUseVehicleAutoDetect,
  mockUseCapabilities,
  mockUseCognitiveDiagnosis,
  mockUseAvailablePids,
} = vi.hoisted(() => ({
  mockAuthStatus: { value: 'anonymous' as 'loading' | 'authed' | 'anonymous' },
  mockLogout: vi.fn(),
  mockUseScenarios: vi.fn(),
  mockUseLiveTelemetry: vi.fn(),
  mockUseDiagnosis: vi.fn(),
  mockUseVehicleAutoDetect: vi.fn(),
  mockUseCapabilities: vi.fn(),
  mockUseCognitiveDiagnosis: vi.fn(),
  mockUseAvailablePids: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => {
  return {
    useNavigate: () => vi.fn(),
    Navigate: ({ to, replace }: { to: string; replace?: boolean }) => (
      <div data-testid="navigate" data-to={to} data-replace={String(replace)} />
    ),
    Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => ({
    status: mockAuthStatus.value,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: mockLogout,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../src/components/dashboard/useScenarios', () => ({
  useScenarios: () => mockUseScenarios(),
}))
vi.mock('../../../src/components/dashboard/useLiveTelemetry', () => ({
  useLiveTelemetry: (_selectedId: string, _pids?: string[]) => mockUseLiveTelemetry(),
}))
vi.mock('../../../src/components/dashboard/useDiagnosis', () => ({
  useDiagnosis: () => mockUseDiagnosis(),
}))
vi.mock('../../../src/components/dashboard/useVehicleAutoDetect', () => ({
  useVehicleAutoDetect: () => mockUseVehicleAutoDetect(),
}))
vi.mock('../../../src/components/dashboard/useCapabilities', () => ({
  useCapabilities: () => mockUseCapabilities(),
}))
vi.mock('../../../src/components/dashboard/useCognitiveDiagnosis', () => ({
  useCognitiveDiagnosis: () => mockUseCognitiveDiagnosis(),
}))
vi.mock('../../../src/components/dashboard/useAvailablePids', () => ({
  useAvailablePids: () => mockUseAvailablePids(),
}))
vi.mock('../../../src/components/dashboard/useEcuInfo', () => ({
  useEcuInfo: () => ({ ecus: [], loading: false, error: null }),
}))
vi.mock('../../../src/components/dashboard/useVehicleStatus', () => ({
  useVehicleStatus: () => ({ status: null, loading: false, error: null }),
}))
vi.mock('../../../src/components/dashboard/useSessionReport', () => ({
  useSessionReport: () => ({
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
  }),
}))

vi.mock('../../../src/lib/api', () => ({
  api: {
    getFreezeFrame: vi.fn(),
    getEcuInfo: vi.fn(),
    getVehicleStatus: vi.fn(),
    getPendingDtc: vi.fn(),
    getPermanentDtc: vi.fn(),
    clearDtc: vi.fn(),
  },
}))

vi.mock('../../../src/components/dashboard/usePendingDtc', () => ({
  usePendingDtc: () => ({ dtcCodes: [], loading: false, error: null }),
}))

vi.mock('../../../src/components/dashboard/usePermanentDtc', () => ({
  usePermanentDtc: () => ({ dtcCodes: [], loading: false, error: null }),
}))

vi.mock('../../../src/components/dashboard/useClearDtc', () => ({
  useClearDtc: () => ({ clearDtc: vi.fn(), loading: false, error: null }),
}))

const mockFreezeFrameHook = vi.fn()

vi.mock('../../../src/components/dashboard/useFreezeFrame', () => ({
  useFreezeFrame: (...args: unknown[]) => mockFreezeFrameHook(...args),
}))

import { api } from '../../../src/lib/api'
import { DashboardPage } from '../../../src/components/dashboard/DashboardPage'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const scenario: Scenario = {
  id: 'audi-a3',
  name: 'Audi A3 1.6 TDI',
  vehicleType: 'car',
  connectionType: 'wifi',
  sensorValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
  dtcConfig: [],
  vehicleInfo: {
    make: 'Audi',
    model: 'A3',
    year: 2015,
    engineType: '1.6 TDI',
    vin: 'WAUZZZ8V5FA123456',
  },
}

const identifiedVehicle = {
  vin: 'WAUZZZ8V5FA123456',
  make: 'Audi',
  model: 'A3',
  year: 2015,
  engineType: '1.6 TDI',
  manufacturer: 'Audi',
  region: { country: 'Germany', region: 'Europe' },
  modelYearDecoded: 2015,
}

function wizardState(overrides: Record<string, unknown> = {}) {
  return {
    step: 'done',
    scenarioId: scenario.id,
    vehicle: identifiedVehicle,
    error: null,
    detect: vi.fn(),
    retry: vi.fn(),
    confirm: vi.fn(),
    restart: vi.fn(),
    ...overrides,
  }
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getPendingDtc).mockResolvedValue({ dtcCodes: [] })
    vi.mocked(api.getPermanentDtc).mockResolvedValue({ dtcCodes: [] })
    vi.mocked(api.clearDtc).mockResolvedValue({ cleared: true })
    mockFreezeFrameHook.mockReturnValue({
      frame: null,
      loading: false,
      error: null,
    })
    mockUseVehicleAutoDetect.mockReturnValue(wizardState())
    vi.stubGlobal('requestAnimationFrame', vi.fn())
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    mockAuthStatus.value = 'anonymous'
    mockUseScenarios.mockReturnValue({
      scenarios: [],
      selectedId: '',
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseLiveTelemetry.mockReturnValue({ live: null, streamOk: false })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis: vi.fn(),
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: false })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })
    mockUseAvailablePids.mockReturnValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("should render <Navigate to='/login' replace /> when auth is anonymous", () => {
    render(<DashboardPage />)

    const nav = screen.getByTestId('navigate')
    expect(nav.getAttribute('data-to')).toBe('/login')
    expect(nav.getAttribute('data-replace')).toBe('true')
    expect(screen.queryByText('Telemetría en vivo')).toBeNull()
  })

  it('should render sidebar and live-data section when auth is authed', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseLiveTelemetry.mockReturnValue({
      live: {
        rpm: 850,
        speed: 0,
        coolantTemp: 90,
        intakeTemp: 35,
        rawData: '41 0C 5A 41 0D 00',
        ts: 1,
      },
      streamOk: true,
    })

    render(<DashboardPage />)

    expect(screen.getByText('Herramienta OBD-II · Diagnóstico Asistido por IA')).toBeDefined()
    expect(screen.getByText('Conectado')).toBeDefined()
    expect(screen.getByText('Telemetría en vivo')).toBeDefined()
    expect(screen.getByText('Datos Vivo')).toBeDefined()
    expect(screen.getByText('Códigos DTC')).toBeDefined()
    expect(screen.getByText('Unidades Control')).toBeDefined()
    expect(screen.getByText('Diagnóstico')).toBeDefined()
    expect(screen.getByText('Protocolo ISO 15765-4 CAN')).toBeDefined()
    expect(screen.queryByTestId('navigate')).toBeNull()
  })

  it('should call auth.logout when the TopBar logout button is clicked', () => {
    mockAuthStatus.value = 'authed'

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Cerrar sesión'))

    expect(mockLogout).toHaveBeenCalledTimes(1)
  })

  it('should render the scenarios error banner when scenariosError is set', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [],
      selectedId: '',
      setSelectedId: vi.fn(),
      scenariosError: 'Error al cargar escenarios',
    })

    render(<DashboardPage />)

    expect(screen.getByText('Error al cargar escenarios')).toBeDefined()
  })

  it('should show the generating state in the diagnosis section while the cognitive call runs', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: true,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Diagnóstico'))

    expect(screen.getByText('Analizando datos OBD-II con IA…')).toBeDefined()
  })

  it('should show the Streaming status and Live badge when the stream is live', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseLiveTelemetry.mockReturnValue({
      live: {
        rpm: 850,
        speed: 0,
        coolantTemp: 90,
        intakeTemp: 35,
        rawData: '41 0C 5A',
        ts: 1,
      },
      streamOk: true,
    })

    render(<DashboardPage />)

    expect(screen.getByText('Transmisión ECU · 1 Hz')).toBeDefined()
    expect(screen.getByText('En Vivo')).toBeDefined()
  })

  it('should show the Reconectando status when stream is down', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })

    render(<DashboardPage />)

    expect(screen.getByText('Reconectando…')).toBeDefined()
    expect(screen.queryByText('En Vivo')).toBeNull()
  })

  it('should render the identification wizard instead of the diagnosis menu without a confirmed vehicle', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: '',
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseVehicleAutoDetect.mockReturnValue(
      wizardState({ step: 'selecting', scenarioId: '', vehicle: null }),
    )

    render(<DashboardPage />)

    expect(screen.getByText('Identificación del vehículo')).toBeDefined()
    expect(screen.queryByText('Telemetría en vivo')).toBeNull()
    expect(screen.getByText('Herramienta OBD-II · Diagnóstico Asistido por IA')).toBeDefined()
  })

  it('should enter the diagnosis menu when the wizard confirms the vehicle', () => {
    mockAuthStatus.value = 'authed'
    const setSelectedId = vi.fn()
    const confirm = vi.fn()
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: '',
      setSelectedId,
      scenariosError: null,
    })
    mockUseVehicleAutoDetect.mockReturnValue(wizardState({ step: 'confirming', confirm }))

    render(<DashboardPage />)

    fireEvent.click(screen.getByText('Entrar a diagnóstico'))

    expect(setSelectedId).toHaveBeenCalledWith(scenario.id)
    expect(confirm).toHaveBeenCalledTimes(1)
  })

  it('should reopen the wizard in detecting when another vehicle is picked in VehicleSelector', () => {
    mockAuthStatus.value = 'authed'
    const detect = vi.fn()
    const other: Scenario = {
      ...scenario,
      id: 'kawa-z900',
      name: 'Kawasaki Z900',
    }
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario, other],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseVehicleAutoDetect.mockReturnValue(wizardState({ detect }))

    render(<DashboardPage />)

    fireEvent.click(screen.getByText('Audi A3 1.6 TDI'))
    fireEvent.click(screen.getByText('Kawasaki Z900'))

    expect(detect).toHaveBeenCalledWith('kawa-z900')
  })

  it('should show the wizard scanning step while a new vehicle is being identified', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseVehicleAutoDetect.mockReturnValue(wizardState({ step: 'detecting', vehicle: null }))

    render(<DashboardPage />)

    expect(screen.getByText('Detectando vehículo…')).toBeDefined()
    expect(screen.queryByText('Telemetría en vivo')).toBeNull()
  })

  it('should render DTC codes and the diagnosis CTA, not the deterministic panel', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [{ code: 'P0301', description: 'Fallo de encendido cilindro 1' }],
        diagnosisText: 'Se recomienda revisar las bujías.',
        severity: 'high',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    // El veredicto OK/Revisar sale de la ventana operativa que sirve la API,
    // asi que el catalogo tiene que estar cargado para que la tabla lo pinte.
    mockUseAvailablePids.mockReturnValue([
      { code: '01 0C', name: 'Engine RPM', unit: 'rpm', operatingWindow: { max: 6500 } },
      {
        code: '01 05',
        name: 'Engine Coolant Temperature',
        unit: '°C',
        operatingWindow: { max: 100 },
      },
      { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h' },
      { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', operatingWindow: { max: 80 } },
    ])

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Códigos DTC'))
    expect(screen.getByText('1 registrado')).toBeDefined()
    expect(screen.getByText('P0301')).toBeDefined()
    expect(screen.getByText('Fallo de encendido cilindro 1')).toBeDefined()

    fireEvent.click(screen.getByTitle('Diagnóstico'))
    // El apartado diagnóstico muestra el chat (CTA vacío), no el texto determinista.
    expect(screen.getByText('Lanzar diagnóstico IA')).toBeDefined()
    expect(screen.queryByText('Se recomienda revisar las bujías.')).toBeNull()
    expect(screen.queryByText('ALTA')).toBeNull()

    fireEvent.click(screen.getByTitle('Datos Vivo'))
    expect(screen.getByText('850')).toBeDefined()
    expect(screen.getByText('050')).toBeDefined()
    expect(screen.getByText('4 registrados')).toBeDefined()
    expect(screen.getByText('01 0C')).toBeDefined()
    expect(screen.getByText('850 RPM')).toBeDefined()
    // 3 de las 4: la velocidad no tiene ventana operativa y se queda sin veredicto.
    expect(screen.getAllByText('OK')).toHaveLength(3)
  })

  it('should navigate to freeze-frame when DTC row is selected', async () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [{ code: 'P0301', description: 'Fallo de encendido cilindro 1' }],
        diagnosisText: 'Revisar bujías.',
        severity: 'high',
      },
      runDiagnosis: vi.fn(),
    })
    mockFreezeFrameHook.mockReturnValue({
      frame: { dtcCode: 'P0301', pidValues: { '0C': 850 } },
      loading: false,
      error: null,
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Códigos DTC'))
    fireEvent.click(screen.getByText('P0301'))

    await waitFor(() => {
      expect(screen.getByText('0C')).toBeDefined()
    })
  })

  it('should show the report panel when sidebar Informe button is clicked', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Informe'))

    expect(screen.getByText('Informe de Sesión de Diagnóstico')).toBeDefined()
    expect(screen.getByText('Diagnóstico Determinista')).toBeDefined()
    expect(screen.getByText('Diagnóstico Cognitivo')).toBeDefined()
  })

  it('should hide the report panel when another sidebar section is clicked', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Informe'))
    expect(screen.getByText('Informe de Sesión de Diagnóstico')).toBeDefined()

    fireEvent.click(screen.getByTitle('Datos Vivo'))
    expect(screen.queryByText('Informe de Sesión de Diagnóstico')).toBeNull()
  })

  it('does not auto-run deterministic or cognitive diagnosis when a vehicle is selected', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    const runDiagnosis = vi.fn()
    const trigger = vi.fn()
    const reset = vi.fn()
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis,
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger,
      reset,
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)

    // Solo se limpia el estado cognitivo del vehículo anterior (reset).
    expect(reset).toHaveBeenCalledTimes(1)
    expect(runDiagnosis).not.toHaveBeenCalled()
    expect(trigger).not.toHaveBeenCalled()
  })

  it("runs only the deterministic diagnosis when 'Iniciar diagnóstico' is clicked", () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    const runDiagnosis = vi.fn().mockResolvedValue(undefined)
    const trigger = vi.fn()
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: null,
      runDiagnosis,
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger,
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)
    fireEvent.click(screen.getByText('Iniciar diagnóstico'))

    expect(runDiagnosis).toHaveBeenCalledTimes(1)
    expect(trigger).not.toHaveBeenCalled()
  })

  it('launches a new cognitive session (no query) from the diagnosis CTA', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    const trigger = vi.fn()
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
        dtcCodes: [],
        diagnosisText: '[LOW] Sin fallos',
        severity: 'low',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: false,
      trigger,
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)

    fireEvent.click(screen.getByTitle('Diagnóstico'))
    fireEvent.click(screen.getByText('Lanzar diagnóstico IA'))

    expect(trigger).toHaveBeenCalledTimes(1)
    expect(trigger).toHaveBeenCalledWith()
  })

  it('should paint the deterministic result while the cognitive call is still loading', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
        dtcCodes: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
        diagnosisText: '[HIGH] Fallo de encendido',
        severity: 'high',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: null,
      loading: true,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)

    expect(screen.getAllByTestId('pid-row')).toHaveLength(4)
    expect(screen.getByText('Buscando PIDs adicionales…')).toBeDefined()

    fireEvent.click(screen.getByTitle('Códigos DTC'))
    expect(screen.getByText('P0301')).toBeDefined()
  })

  it('should append the AI rows to the PIDs table once they resolve', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 0, intakeTemp: 35 },
        dtcCodes: [],
        diagnosisText: '[LOW] Sin fallos',
        severity: 'low',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseCapabilities.mockReturnValue({ cognitiveDiagnosis: true })
    mockUseCognitiveDiagnosis.mockReturnValue({
      pidRows: [
        {
          code: '01 42',
          description: 'Voltaje del módulo de control',
          value: '10.9 V',
          status: 'review',
          source: 'ai',
        },
      ],
      loading: false,
      trigger: vi.fn(),
      reset: vi.fn(),
      diagnosisText: null,
      severity: null,
      confidence: null,
      recommendations: null,
      conversationHistory: [],
    })

    render(<DashboardPage />)

    expect(screen.getAllByTestId('pid-row')).toHaveLength(5)
    expect(screen.getByText('01 42')).toBeDefined()
    expect(screen.getByText('IA')).toBeDefined()
  })

  it("should show a USB icon in TopBar when the selected scenario has connectionType 'usb'", () => {
    mockAuthStatus.value = 'authed'
    const usbScenario: Scenario = {
      ...scenario,
      id: 'usb',
      name: 'ELM327 USB',
      connectionType: 'usb',
    }
    mockUseScenarios.mockReturnValue({
      scenarios: [usbScenario],
      selectedId: 'usb',
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseLiveTelemetry.mockReturnValue({
      live: {
        rpm: 850,
        speed: 0,
        coolantTemp: 90,
        intakeTemp: 35,
        rawData: '41 0C 5A 41 0D 00',
        ts: 1,
      },
      streamOk: true,
    })

    render(<DashboardPage />)

    expect(screen.getByTestId('connection-usb')).toBeDefined()
    expect(screen.queryByTestId('connection-wifi')).toBeNull()
  })

  it('should propagate the selected PIDs from PidsTable to TelemetrySection', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [],
        diagnosisText: 'Sin fallos',
        severity: 'low',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseLiveTelemetry.mockReturnValue({
      live: { rpm: 850, speed: 50, coolantTemp: 90, intakeTemp: 35, rawData: '', ts: 1 },
      streamOk: true,
      readings: null,
    })

    render(<DashboardPage />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
    expect(screen.getByText('Refrigerante')).toBeDefined()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar PID 05' }))

    expect(screen.queryByText('Refrigerante')).toBeNull()
    expect(screen.getByText('RPM')).toBeDefined()
    expect(screen.getByText('Velocidad')).toBeDefined()
    expect(screen.getByText('Admisión')).toBeDefined()
  })

  it('should reset the PID selection to the 4 defaults when the vehicle changes', () => {
    mockAuthStatus.value = 'authed'
    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: scenario.id,
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    mockUseDiagnosis.mockReturnValue({
      loading: false,
      result: {
        rawData: '41 0C 5A',
        parsedValues: { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 },
        dtcCodes: [],
        diagnosisText: 'Sin fallos',
        severity: 'low',
      },
      runDiagnosis: vi.fn(),
    })
    mockUseLiveTelemetry.mockReturnValue({
      live: { rpm: 850, speed: 50, coolantTemp: 90, intakeTemp: 35, rawData: '', ts: 1 },
      streamOk: true,
      readings: null,
    })

    const { rerender } = render(<DashboardPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar PID 05' }))
    expect(screen.queryByText('Refrigerante')).toBeNull()

    mockUseScenarios.mockReturnValue({
      scenarios: [scenario],
      selectedId: 'kawa-z900',
      setSelectedId: vi.fn(),
      scenariosError: null,
    })
    rerender(<DashboardPage />)

    expect(screen.getByText('Refrigerante')).toBeDefined()
    const checked = screen.getAllByRole('checkbox').filter((c) => (c as HTMLInputElement).checked)
    expect(checked).toHaveLength(4)
  })
})
