import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IntakeThermo } from '../../../src/components/dashboard/IntakeThermo'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('IntakeThermo', () => {
  it('should render a normal intake temperature without warning', () => {
    const { container } = render(<IntakeThermo value={35} loading={false} warnAt={80} />)

    expect(screen.getByText('35')).toBeDefined()
    expect(container.querySelector('span.text-primary')).toBeNull()
  })

  it('should apply warning styling above the intake warning threshold', () => {
    const { container } = render(<IntakeThermo value={95} loading={false} warnAt={80} />)

    expect(screen.getByText('95')).toBeDefined()
    expect(container.querySelector('span.text-primary')).not.toBeNull()
  })

  it('should render 0 when value is null', () => {
    render(<IntakeThermo value={null} loading={false} warnAt={80} />)

    expect(screen.getByText('0')).toBeDefined()
    expect(screen.queryByText('0 — 120°C')).toBeDefined()
  })

  it('should show the loading placeholder instead of the value', () => {
    render(<IntakeThermo value={35} loading={true} warnAt={80} />)

    expect(screen.getByText('--')).toBeDefined()
    expect(screen.queryByText('35')).toBeNull()
  })
})
