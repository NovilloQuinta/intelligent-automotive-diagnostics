import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DiagnoseButton } from '../../../src/components/dashboard/DiagnoseButton'

describe('DiagnoseButton', () => {
  const onClick = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render the idle CTA enabled and the raw OBD frame placeholder', () => {
    const { container } = render(
      <DiagnoseButton loading={false} disabled={false} onClick={onClick} rawSummary={null} />,
    )

    expect(screen.getByText('Iniciar diagnóstico')).toBeDefined()
    expect(screen.getByText('Aguardando trama OBD-II…')).toBeDefined()
    expect(container.querySelector('button')?.disabled).toBe(false)
  })

  it('should render the loading state and disable the button', () => {
    const { container } = render(
      <DiagnoseButton loading={true} disabled={false} onClick={onClick} rawSummary={null} />,
    )

    expect(screen.getByText('Diagnosticando…')).toBeDefined()
    expect(screen.queryByText('Iniciar diagnóstico')).toBeNull()
    expect(container.querySelector('button')?.disabled).toBe(true)
  })

  it('should disable the button when the disabled prop is true', () => {
    const { container } = render(
      <DiagnoseButton loading={false} disabled={true} onClick={onClick} rawSummary={null} />,
    )

    expect(container.querySelector('button')?.disabled).toBe(true)
  })

  it('should render the raw OBD summary when provided', () => {
    render(
      <DiagnoseButton
        loading={false}
        disabled={false}
        onClick={onClick}
        rawSummary="41 0C 5A 41 0D 00"
      />,
    )

    expect(screen.getByText('41 0C 5A 41 0D 00')).toBeDefined()
    expect(screen.queryByText('Aguardando trama OBD-II…')).toBeNull()
  })

  it('should call onDiagnose when clicked', () => {
    render(<DiagnoseButton loading={false} disabled={false} onClick={onClick} rawSummary={null} />)

    fireEvent.click(screen.getByRole('button', { name: 'Iniciar diagnóstico' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('should not call onDiagnose when the button is disabled', () => {
    const { container } = render(
      <DiagnoseButton loading={false} disabled={true} onClick={onClick} rawSummary={null} />,
    )

    fireEvent.click(container.querySelector('button')!)

    expect(onClick).not.toHaveBeenCalled()
  })
})
