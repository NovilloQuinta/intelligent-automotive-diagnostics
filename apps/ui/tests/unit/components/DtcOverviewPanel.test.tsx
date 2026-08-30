import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DtcOverviewPanel } from '../../../src/components/dashboard/DtcOverviewPanel'

const emptyHook = { dtcCodes: [], loading: false, error: null }

vi.mock('../../../src/components/dashboard/usePendingDtc', () => ({
  usePendingDtc: () => emptyHook,
}))

vi.mock('../../../src/components/dashboard/usePermanentDtc', () => ({
  usePermanentDtc: () => emptyHook,
}))

vi.mock('../../../src/components/dashboard/useClearDtc', () => ({
  useClearDtc: () => ({ clearDtc: vi.fn(), loading: false, error: null }),
}))

const mockUseFreezeFrame = vi.fn()
vi.mock('../../../src/components/dashboard/useFreezeFrame', () => ({
  useFreezeFrame: () => mockUseFreezeFrame(),
}))

vi.mock('../../../src/components/dashboard/useAvailablePids', () => ({
  useAvailablePids: () => [],
}))

beforeEach(() => {
  mockUseFreezeFrame.mockReturnValue({ frame: null, loading: false, error: null })
})

describe('DtcOverviewPanel', () => {
  it('renders the DTC list and the freeze frame for the selected code side by side', () => {
    mockUseFreezeFrame.mockReturnValue({
      frame: { dtcCode: 'P0301', pidValues: { '0C': 850 } },
      loading: false,
      error: null,
    })
    render(
      <DtcOverviewPanel
        codes={[{ code: 'P0301', description: 'Fallo de encendido cilindro 1' }]}
        severity="high"
        empty={false}
        selectedCode="P0301"
        onSelect={vi.fn()}
        scenarioId="audi-a3-idle"
      />,
    )

    expect(screen.getAllByText('P0301').length).toBeGreaterThan(0)
    expect(screen.getByText('Fallo de encendido cilindro 1')).toBeDefined()
    expect(screen.getByText('Freeze Frame')).toBeDefined()
    expect(screen.getByText('0C')).toBeDefined()
  })

  it('prompts to pick a DTC in the freeze frame panel when none is selected', () => {
    render(
      <DtcOverviewPanel
        codes={[]}
        severity={null}
        empty={false}
        selectedCode={null}
        onSelect={vi.fn()}
        scenarioId="audi-a3-idle"
      />,
    )

    expect(screen.getByText('Selecciona un código DTC para ver su freeze frame')).toBeDefined()
  })
})
