import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CoolantBar } from '../../../src/components/dashboard/CoolantBar'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CoolantBar', () => {
  it('should render a normal temperature without alarm', () => {
    const { container } = render(<CoolantBar value={90} loading={false} alarmAt={100} />)

    expect(screen.getByText('90')).toBeDefined()
    expect(screen.queryByText('Alarma')).toBeNull()
    expect(container.querySelector('span.text-destructive')).toBeNull()
  })

  it('should show the alarm label and destructive styling above the alarm threshold', () => {
    const { container } = render(<CoolantBar value={105} loading={false} alarmAt={100} />)

    expect(screen.getByText('105')).toBeDefined()
    expect(screen.getByText('Alarma')).toBeDefined()
    expect(container.querySelector('span.text-destructive')).not.toBeNull()
  })

  it('should not raise an alarm without a threshold from the catalog', () => {
    // Sin ventana operativa no hay criterio: el valor se pinta, pero no se juzga.
    const { container } = render(<CoolantBar value={130} loading={false} />)

    expect(screen.getByText('130')).toBeDefined()
    expect(screen.queryByText('Alarma')).toBeNull()
    expect(container.querySelector('span.text-destructive')).toBeNull()
  })

  it('should render 0 without alarm when value is null', () => {
    render(<CoolantBar value={null} loading={false} alarmAt={100} />)

    expect(screen.getByText('0')).toBeDefined()
    expect(screen.queryByText('Alarma')).toBeNull()
  })

  it('should show the loading placeholder instead of the value', () => {
    render(<CoolantBar value={90} loading={true} alarmAt={100} />)

    expect(screen.getByText('--')).toBeDefined()
    expect(screen.queryByText('90')).toBeNull()
  })
})
