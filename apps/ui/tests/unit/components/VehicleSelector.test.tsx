import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { VehicleSelector } from '../../../src/components/dashboard/VehicleSelector'
import type { Scenario } from '../../../src/components/dashboard/types'

const scenarios: Scenario[] = [
  {
    id: 'scenario-1',
    name: 'Audi A3 Sportback 2.0 TDI',
    vehicleType: 'car',
    sensorValues: { rpm: 1800, coolantTemp: 90, speed: 60, intakeTemp: 35 },
    dtcConfig: [{ code: 'P0101', description: 'MAF sensor fault' }],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2019,
      engineType: '2.0 TDI',
      vin: 'WAUZZZ8V3K1000001',
    },
  },
  {
    id: 'scenario-2',
    name: 'Honda CBR 600RR',
    vehicleType: 'motorcycle',
    sensorValues: { rpm: 4000, coolantTemp: 88, speed: 40, intakeTemp: 30 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Honda',
      model: 'CBR600RR',
      year: 2020,
      engineType: '600cc',
      vin: 'JH2PC',
    },
  },
]

describe('VehicleSelector', () => {
  it('shows the name of the currently selected vehicle', () => {
    render(
      <VehicleSelector
        scenarios={scenarios}
        value="scenario-2"
        onChange={vi.fn()}
        disabled={false}
      />,
    )

    expect(screen.getByText('Honda CBR 600RR')).toBeInTheDocument()
    expect(screen.queryByText('Audi A3 Sportback 2.0 TDI')).not.toBeInTheDocument()
  })

  it('opens the dropdown with both scenarios when the button is clicked', () => {
    render(
      <VehicleSelector
        scenarios={scenarios}
        value="scenario-1"
        onChange={vi.fn()}
        disabled={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Audi A3/i }))

    // The dropdown lists both scenarios as selectable options
    expect(screen.getByText('Honda CBR 600RR')).toBeInTheDocument()
    expect(screen.getAllByText('Audi A3 Sportback 2.0 TDI')).toHaveLength(2)
  })

  it('calls onChange with the scenario id when an option is clicked', () => {
    const onChange = vi.fn()
    render(
      <VehicleSelector
        scenarios={scenarios}
        value="scenario-1"
        onChange={onChange}
        disabled={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Audi A3/i }))
    fireEvent.click(screen.getByText('Honda CBR 600RR'))

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('scenario-2')
  })

  it('closes dropdown on click outside', () => {
    render(
      <VehicleSelector
        scenarios={scenarios}
        value="scenario-1"
        onChange={vi.fn()}
        disabled={false}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Audi A3/i }))
    expect(screen.getByText('Honda CBR 600RR')).toBeInTheDocument()

    // Click outside → dropdown closes
    fireEvent.mouseDown(document.body)
    expect(screen.queryByText('Honda CBR 600RR')).not.toBeInTheDocument()
  })

  it('shows placeholder when no scenario selected', () => {
    render(<VehicleSelector scenarios={[]} value="" onChange={vi.fn()} disabled={false} />)

    expect(screen.getByText('Seleccionar vehículo')).toBeDefined()
  })

  it('button is disabled when disabled prop is true', () => {
    render(
      <VehicleSelector
        scenarios={scenarios}
        value="scenario-1"
        onChange={vi.fn()}
        disabled={true}
      />,
    )

    expect(screen.getByRole('button')).toBeDisabled()
  })
})
