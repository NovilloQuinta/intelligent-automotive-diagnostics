import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FreezeFramePanel } from '../../../src/components/dashboard/FreezeFramePanel'
import type { FreezeFrame } from '../../../src/components/dashboard/types'

const { mockUseFreezeFrame, mockUseAvailablePids } = vi.hoisted(() => ({
  mockUseFreezeFrame: vi.fn(),
  mockUseAvailablePids: vi.fn(),
}))

vi.mock('../../../src/components/dashboard/useFreezeFrame', () => ({
  useFreezeFrame: mockUseFreezeFrame,
}))

vi.mock('../../../src/components/dashboard/useAvailablePids', () => ({
  useAvailablePids: mockUseAvailablePids,
}))

const SAMPLE_FRAME: FreezeFrame = {
  dtcCode: 'P0301',
  pidValues: { '0C': 850, '05': 90 },
}

const CATALOG = [
  { code: '01 0C', name: 'Engine RPM', unit: 'rpm' },
  { code: '01 05', name: 'Coolant Temp', unit: '°C' },
]

describe('FreezeFramePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: null,
      error: null,
    })
    mockUseAvailablePids.mockReturnValue([])
  })

  it('should render the empty-selection prompt when no dtc is selected', () => {
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc={null} />)

    expect(screen.getByText('Selecciona un código DTC para ver su freeze frame')).toBeDefined()
    expect(mockUseFreezeFrame).toHaveBeenCalledWith('audi-a3-idle', null)
  })

  it('should render a loading state while the frame is being fetched', () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: true,
      frame: null,
      error: null,
    })
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />)

    expect(screen.getByText('Cargando freeze frame…')).toBeDefined()
  })

  it('should render the no-freeze-frame message when the API returns null', () => {
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0420" />)

    expect(screen.getByText('Sin freeze frame para este código')).toBeDefined()
  })

  it('should render the error message when the request fails', () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: null,
      error: 'Scenario not found',
    })
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />)

    expect(screen.getByText('Scenario not found')).toBeDefined()
  })

  it('should render raw hex + value when the catalog is empty', () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: SAMPLE_FRAME,
      error: null,
    })
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />)

    expect(screen.getByText('0C')).toBeDefined()
    expect(screen.getByText('850')).toBeDefined()
    expect(screen.getByText('05')).toBeDefined()
    expect(screen.getByText('90')).toBeDefined()
    expect(screen.queryByText('Sin freeze frame para este código')).toBeNull()
  })

  it('should render name + unit for PIDs present in the catalog', () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: SAMPLE_FRAME,
      error: null,
    })
    mockUseAvailablePids.mockReturnValue(CATALOG)
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />)

    expect(screen.getByText('Engine RPM')).toBeDefined()
    expect(screen.getByText('850 rpm')).toBeDefined()
    expect(screen.getByText('Coolant Temp')).toBeDefined()
    expect(screen.getByText('90 °C')).toBeDefined()
    expect(screen.queryByText('0C')).toBeNull()
    expect(screen.queryByText('850')).toBeNull()
  })

  it('should render raw hex + value for PIDs missing from the catalog', () => {
    mockUseFreezeFrame.mockReturnValue({
      loading: false,
      frame: { dtcCode: 'P0301', pidValues: { '0C': 850, AB: 42 } },
      error: null,
    })
    mockUseAvailablePids.mockReturnValue(CATALOG)
    render(<FreezeFramePanel scenarioId="audi-a3-idle" dtc="P0301" />)

    expect(screen.getByText('Engine RPM')).toBeDefined()
    expect(screen.getByText('850 rpm')).toBeDefined()
    expect(screen.getByText('AB')).toBeDefined()
    expect(screen.getByText('42')).toBeDefined()
  })
})
