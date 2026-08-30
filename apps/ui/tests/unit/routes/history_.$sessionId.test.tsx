import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockUseDiagnosisHistoryDetail, mockUseCognitiveDiagnosis, mockSessionId } = vi.hoisted(
  () => ({
    mockUseDiagnosisHistoryDetail: vi.fn(),
    mockUseCognitiveDiagnosis: vi.fn(),
    mockSessionId: { value: '123' },
  }),
)

vi.mock('../../../src/components/history/useDiagnosisHistoryDetail', async () => {
  const actual = await vi.importActual<
    typeof import('../../../src/components/history/useDiagnosisHistoryDetail')
  >('../../../src/components/history/useDiagnosisHistoryDetail')
  return {
    ...actual,
    useDiagnosisHistoryDetail: mockUseDiagnosisHistoryDetail,
  }
})

vi.mock('../../../src/components/dashboard/useCognitiveDiagnosis', () => ({
  useCognitiveDiagnosis: mockUseCognitiveDiagnosis,
}))

vi.mock('../../../src/components/dashboard/SessionReportPanel', () => ({
  SessionReportPanel: () => <div data-testid="session-report-panel" />,
}))

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    options: { component: config.component },
    useParams: () => ({ sessionId: mockSessionId.value }),
  }),
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../../src/lib/auth-context', () => ({
  useAuth: () => ({
    status: 'authed' as const,
    user: { id: 1, username: 'test', isAdmin: false },
    logout: vi.fn(),
  }),
}))

import { Route } from '../../../src/routes/history_.$sessionId'
const HistoryDetailRoute = (Route as unknown as { options: { component: React.ComponentType } })
  .options.component

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_HOOK_STATE = {
  session: null,
  reportState: null,
  isLoading: false,
  isError: false,
  error: null as Error | null,
}

const DEFAULT_ON_DEMAND_STATE = {
  pidRows: null,
  diagnosisText: null as string | null,
  severity: null,
  confidence: null,
  recommendations: null,
  conversationHistory: [],
  sessionId: null,
  error: null as { message: string } | null,
  loading: false,
  trigger: vi.fn(),
  reset: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('history.$sessionId route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSessionId.value = '123'
    mockUseDiagnosisHistoryDetail.mockReturnValue(DEFAULT_HOOK_STATE)
    mockUseCognitiveDiagnosis.mockReturnValue({ ...DEFAULT_ON_DEMAND_STATE, trigger: vi.fn() })
  })

  it('should render the shared header and footer in the loading state', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isLoading: true,
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByText('Cargando informe…')).toBeDefined()
    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
    expect(screen.getByText('Contacto')).toBeDefined()
  })

  it('should render the shared header and footer in the error state', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      isError: true,
      error: new Error('boom'),
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByText(/Error al cargar el informe/i)).toBeDefined()
    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
  })

  it('should render the shared header and footer for an invalid session id', () => {
    mockSessionId.value = 'abc'
    render(<HistoryDetailRoute />)

    expect(screen.getByText('ID de sesión inválido')).toBeDefined()
    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
  })

  it('should render the shared header and footer alongside the report panel', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: null,
        startedAt: '2026-08-09T10:30:00.000Z',
        endedAt: null,
        severity: 'low',
        dtcCount: 1,
        resultJson: null,
      },
      reportState: { severity: 'low' },
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByTestId('session-report-panel')).toBeDefined()
    expect(screen.getByText('IADiagnostics')).toBeDefined()
    expect(screen.getByText('Términos')).toBeDefined()
    expect(screen.getByText('Privacidad')).toBeDefined()
  })

  it('should offer to generate an on-demand diagnosis when the session has a scenario but no saved narrative', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: 'audi-a3-tdi',
        startedAt: '2026-08-09T10:30:00.000Z',
        endedAt: null,
        severity: 'low',
        dtcCount: 1,
        resultJson: null,
      },
      reportState: null,
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByText(/Esta sesión no guardó un diagnóstico/i)).toBeDefined()
    expect(screen.getByRole('button', { name: /Generar diagnóstico IA/i })).toBeDefined()
  })

  it('should trigger the cognitive diagnosis for the session scenario when the button is clicked', async () => {
    const trigger = vi.fn()
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: 'audi-a3-tdi',
        startedAt: '2026-08-09T10:30:00.000Z',
        endedAt: null,
        severity: 'low',
        dtcCount: 1,
        resultJson: null,
      },
      reportState: null,
    })
    mockUseCognitiveDiagnosis.mockReturnValue({ ...DEFAULT_ON_DEMAND_STATE, trigger })
    render(<HistoryDetailRoute />)

    await userEvent.click(screen.getByRole('button', { name: /Generar diagnóstico IA/i }))

    expect(trigger).toHaveBeenCalledOnce()
    expect(mockUseCognitiveDiagnosis).toHaveBeenCalledWith('audi-a3-tdi')
  })

  it('should render the report panel once the on-demand diagnosis resolves', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: 'audi-a3-tdi',
        startedAt: '2026-08-09T10:30:00.000Z',
        endedAt: null,
        severity: 'low',
        dtcCount: 1,
        resultJson: null,
      },
      reportState: null,
    })
    mockUseCognitiveDiagnosis.mockReturnValue({
      ...DEFAULT_ON_DEMAND_STATE,
      diagnosisText: 'Todo en orden, solo un sensor a vigilar.',
      severity: 'low',
      confidence: 0.8,
      recommendations: ['Revisar en el próximo mantenimiento'],
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByTestId('session-report-panel')).toBeDefined()
  })

  it('should show the generic error when the session has neither a saved narrative nor a scenario to replay', () => {
    mockUseDiagnosisHistoryDetail.mockReturnValue({
      ...DEFAULT_HOOK_STATE,
      session: {
        id: 123,
        vehicleId: null,
        scenarioId: null,
        startedAt: '2026-08-09T10:30:00.000Z',
        endedAt: null,
        severity: 'low',
        dtcCount: 1,
        resultJson: null,
      },
      reportState: null,
    })
    render(<HistoryDetailRoute />)

    expect(screen.getByText(/Los datos del informe no están disponibles/i)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Generar diagnóstico IA/i })).toBeNull()
  })
})
