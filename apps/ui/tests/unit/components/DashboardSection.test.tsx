import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DashboardSection } from '../../../src/components/dashboard/DashboardSection'
import type { SidebarSection } from '../../../src/components/layout/Sidebar'

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    activeSection: 'diagnosis' as SidebarSection,
    selectedId: 'audi-a3',
    selectedScenario: null,
    telemetry: {
      rpm: null,
      coolant: null,
      speed: null,
      intake: null,
      rawSummary: null,
    },
    diagnosis: {
      loading: false,
      streamOk: true,
      result: null,
      dtcCodes: null,
      selectedDtc: null,
    },
    cognitive: {
      severity: null,
      confidence: null,
      conversationHistory: [],
      loading: false,
      error: null,
      pidRows: null,
      available: true,
    },
    ecu: { ecus: null, loading: false, error: null },
    onDiagnose: vi.fn(),
    onDtcSelect: vi.fn(),
    onChatSend: vi.fn(),
    onLaunchDiagnosis: vi.fn(),
    canLaunch: true,
    ...overrides,
  }
}

describe('DashboardSection — diagnosis', () => {
  it('renders DiagnosisChat (the CTA) instead of the deterministic panel', () => {
    render(<DashboardSection {...baseProps()} />)

    expect(screen.getByText('Lanzar diagnóstico IA')).toBeDefined()
    // El panel determinista ya no existe: no hay header "Diagnóstico IA"
    // separado del chat (solo el título interno del chat).
    expect(
      screen.queryByText('Sin datos. Ejecuta un diagnóstico para obtener el informe.'),
    ).toBeNull()
  })

  it('renders the LLM output as a chat message when there is history', () => {
    render(
      <DashboardSection
        {...baseProps({
          cognitive: {
            severity: 'high',
            confidence: 0.9,
            conversationHistory: [
              { __type: 'raw_response', data: { text: 'Fallo de encendido.' } },
            ],
            loading: false,
            error: null,
            pidRows: null,
            available: true,
          },
        })}
      />,
    )

    expect(screen.getByText('Fallo de encendido.')).toBeDefined()
    expect(screen.queryByText('Lanzar diagnóstico IA')).toBeNull()
  })

  it('shows the unavailable message when the cognitive capability is off', () => {
    render(
      <DashboardSection
        {...baseProps({
          cognitive: {
            severity: null,
            confidence: null,
            conversationHistory: [],
            loading: false,
            error: null,
            pidRows: null,
            available: false,
          },
        })}
      />,
    )

    expect(
      screen.getByText('El diagnóstico cognitivo no está disponible en este entorno.'),
    ).toBeDefined()
  })
})

describe('DashboardSection — ecu overview', () => {
  const ECUS = [
    {
      id: 1,
      vehicleId: 1,
      name: 'Motor',
      requestAddr: '7E0',
      responseAddr: '7E8',
      type: 'ECM',
      protocol: 'ISO 15765-4 CAN',
    },
  ]

  it('renders the ECU table by default', () => {
    render(
      <DashboardSection
        {...baseProps({
          activeSection: 'ecu' as SidebarSection,
          ecu: { ecus: ECUS, loading: false, error: null },
        })}
      />,
    )

    expect(screen.getByText('Unidades de Control')).toBeDefined()
    expect(screen.getByText('Motor')).toBeDefined()
  })

  it('switches to the topology map with the ECUs already held in `ecu`', async () => {
    const user = userEvent.setup()
    render(
      <DashboardSection
        {...baseProps({
          activeSection: 'ecu' as SidebarSection,
          ecu: { ecus: ECUS, loading: false, error: null },
        })}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Mapa' }))

    expect(screen.getByText('Topología del Bus')).toBeDefined()
    expect(screen.getByRole('button', { name: /motor/i })).toBeDefined()
  })

  it('propagates the ECU loading state to both table and map tabs', () => {
    render(
      <DashboardSection
        {...baseProps({
          activeSection: 'ecu' as SidebarSection,
          ecu: { ecus: null, loading: true, error: null },
        })}
      />,
    )

    expect(screen.getByText(/cargando ecus/i)).toBeDefined()
  })
})
