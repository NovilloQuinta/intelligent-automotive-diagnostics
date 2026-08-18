import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SpeedDisplay } from '../../../src/components/dashboard/SpeedDisplay'

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn())
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SpeedDisplay', () => {
  it('should render the speed 0 zero-padded', () => {
    render(<SpeedDisplay value={0} loading={false} />)

    expect(screen.getByText('000')).toBeDefined()
  })

  it('should round decimal values and zero-pad them', () => {
    render(<SpeedDisplay value={88.6} loading={false} />)

    expect(screen.getByText('089')).toBeDefined()
  })

  it('should render 000 when value is null', () => {
    render(<SpeedDisplay value={null} loading={false} />)

    expect(screen.getByText('000')).toBeDefined()
  })

  it('should show the loading placeholder instead of the value', () => {
    render(<SpeedDisplay value={50} loading={true} />)

    expect(screen.getByText('---')).toBeDefined()
    expect(screen.queryByText('050')).toBeNull()
  })
})
