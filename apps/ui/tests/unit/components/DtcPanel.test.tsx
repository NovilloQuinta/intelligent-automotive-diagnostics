import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DtcPanel } from '../../../src/components/dashboard/DtcPanel'

const mockPendingHook = vi.fn()
const mockPermanentHook = vi.fn()
const mockClearDtcFn = vi.fn()

vi.mock('../../../src/components/dashboard/usePendingDtc', () => ({
  usePendingDtc: (_scenarioId: string) => mockPendingHook(),
}))

vi.mock('../../../src/components/dashboard/usePermanentDtc', () => ({
  usePermanentDtc: (_scenarioId: string) => mockPermanentHook(),
}))

vi.mock('../../../src/components/dashboard/useClearDtc', () => ({
  useClearDtc: () => ({
    clearDtc: mockClearDtcFn,
    loading: false,
    error: null,
  }),
}))

const emptyHook = { dtcCodes: [], loading: false, error: null }

function setPendingHook(value: typeof emptyHook = emptyHook) {
  mockPendingHook.mockReturnValue(value)
}

function setPermanentHook(value: typeof emptyHook = emptyHook) {
  mockPermanentHook.mockReturnValue(value)
}

beforeEach(() => {
  setPendingHook()
  setPermanentHook()
  mockClearDtcFn.mockReset()
})

describe('DtcPanel', () => {
  const DEFAULT_PROPS = {
    codes: null as { code: string; description: string }[] | null,
    severity: null as 'low' | 'medium' | 'high' | 'critical' | null,
    empty: false,
    selectedCode: null as string | null,
    onSelect: vi.fn(),
    scenarioId: 'audi-a3-idle',
  }

  it('should render the empty prompt when empty', () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={null} empty={true} />)

    expect(screen.getByText('Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO')).toBeDefined()
    expect(screen.queryByText('Ningún código de error')).toBeNull()
  })

  it('should render NoCodesMessage for an empty stored codes array', () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    expect(
      screen.getByText('Ningún código de error — el vehículo no presenta fallos registrados.'),
    ).toBeDefined()
  })

  it('should list DTC codes with the severity meta when present', () => {
    const codes = [{ code: 'P0301', description: 'Cilindro 1: fallo de encendido' }]
    const { container } = render(
      <DtcPanel {...DEFAULT_PROPS} codes={codes} severity="critical" empty={false} />,
    )

    expect(screen.getByText('P0301')).toBeDefined()
    expect(screen.getByText('Cilindro 1: fallo de encendido')).toBeDefined()
    expect(screen.getByText('1 registrado')).toBeDefined()
    expect(container.querySelector('.lucide-shield-alert')).not.toBeNull()
  })

  it('should use medium severity meta when severity is null', () => {
    const codes = [
      { code: 'P0420', description: 'Eficiencia del catalizador' },
      { code: 'P0128', description: 'Termostato' },
    ]
    const { container } = render(
      <DtcPanel {...DEFAULT_PROPS} codes={codes} severity={null} empty={false} />,
    )

    expect(screen.getByText('2 registrados')).toBeDefined()
    expect(screen.getByText('P0420')).toBeDefined()
    expect(screen.getByText('P0128')).toBeDefined()
    expect(container.querySelector('.lucide-triangle-alert')).not.toBeNull()
  })

  it('should invoke onSelect with the code when a row is clicked', () => {
    const onSelect = vi.fn()
    const codes = [{ code: 'P0301', description: 'Misfire' }]
    render(
      <DtcPanel
        {...DEFAULT_PROPS}
        codes={codes}
        severity={null}
        empty={false}
        onSelect={onSelect}
      />,
    )

    fireEvent.click(screen.getByText('P0301'))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith('P0301')
  })

  it('should mark only the selected row as selected', () => {
    const codes = [
      { code: 'P0301', description: 'Misfire' },
      { code: 'P0420', description: 'Catalyst' },
    ]
    render(
      <DtcPanel
        {...DEFAULT_PROPS}
        codes={codes}
        severity={null}
        empty={false}
        onSelect={vi.fn()}
        selectedCode="P0301"
      />,
    )

    const selectedRow = screen.getByText('P0301').closest('li')
    const otherRow = screen.getByText('P0420').closest('li')

    expect(selectedRow?.getAttribute('aria-selected')).toBe('true')
    expect(selectedRow?.className).toContain('bg-primary/10')
    expect(otherRow?.getAttribute('aria-selected')).toBe('false')
    expect(otherRow?.className).not.toContain('bg-primary/10')
  })

  it('should render three DTC tabs: Almacenadas, Pendientes, Permanentes', () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    expect(screen.getByRole('tab', { name: 'Almacenadas' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Pendientes' })).toBeDefined()
    expect(screen.getByRole('tab', { name: 'Permanentes' })).toBeDefined()
  })

  it("should show 'Ninguna' in pending and permanent tabs when there are no codes", async () => {
    setPendingHook({ dtcCodes: [], loading: false, error: null })
    setPermanentHook({ dtcCodes: [], loading: false, error: null })
    const user = userEvent.setup()
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    await user.click(screen.getByRole('tab', { name: 'Pendientes' }))

    expect(screen.getByText('Ninguna')).toBeDefined()
  })

  it('should show pending codes when they exist', async () => {
    const pendingCodes = [{ code: 'P0171', description: 'Mezcla pobre' }]
    setPendingHook({ dtcCodes: pendingCodes, loading: false, error: null })
    setPermanentHook({ dtcCodes: [], loading: false, error: null })
    const user = userEvent.setup()
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    await user.click(screen.getByRole('tab', { name: 'Pendientes' }))

    expect(screen.getByText('P0171')).toBeDefined()
    expect(screen.getByText('Mezcla pobre')).toBeDefined()
  })

  it('should show permanent codes when they exist', async () => {
    const permanentCodes = [{ code: 'P0420', description: 'Catalizador' }]
    setPendingHook({ dtcCodes: [], loading: false, error: null })
    setPermanentHook({
      dtcCodes: permanentCodes,
      loading: false,
      error: null,
    })
    const user = userEvent.setup()
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    await user.click(screen.getByRole('tab', { name: 'Permanentes' }))

    expect(screen.getByText('P0420')).toBeDefined()
    expect(screen.getByText('Catalizador')).toBeDefined()
  })

  it("should render a 'Borrar averías' button", () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    expect(screen.getByRole('button', { name: /borrar averías/i })).toBeDefined()
  })

  it("should open the confirmation dialog when clicking 'Borrar averías'", async () => {
    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    fireEvent.click(screen.getByRole('button', { name: /borrar averías/i }))

    await waitFor(() => {
      expect(screen.getByText(/Se borrarán las averías y sus freeze frames/)).toBeDefined()
    })
  })

  it('should call clearDtc on confirmation and show a success message', async () => {
    mockClearDtcFn.mockResolvedValue(true)

    render(<DtcPanel {...DEFAULT_PROPS} codes={[]} empty={false} />)

    fireEvent.click(screen.getByRole('button', { name: /borrar averías/i }))

    await waitFor(() => {
      expect(screen.getByText(/Se borrarán las averías y sus freeze frames/)).toBeDefined()
    })

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }))

    await waitFor(() => {
      expect(mockClearDtcFn).toHaveBeenCalledWith('audi-a3-idle')
    })
  })
})
