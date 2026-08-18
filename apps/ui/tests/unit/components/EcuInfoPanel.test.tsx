import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EcuInfoPanel } from '../../../src/components/dashboard/EcuInfoPanel'

const sampleEcus = [
  {
    id: 0,
    vehicleId: 0,
    name: 'Engine Control Unit',
    requestAddr: '7E0',
    responseAddr: '7E8',
    type: 'ECM',
    protocol: 'ISO 15765-4 (CAN 11/500)',
  },
]

describe('EcuInfoPanel', () => {
  it('should show prompt when no vehicle selected', () => {
    render(<EcuInfoPanel ecus={[]} loading={false} error={null} selectedId={null} />)

    expect(screen.getByText('Selecciona un vehículo para ver sus ECUs')).toBeDefined()
  })

  it('should show loader when loading', () => {
    render(<EcuInfoPanel ecus={[]} loading={true} error={null} selectedId={'audi-a3-idle'} />)

    expect(screen.getByText('Cargando ECUs…')).toBeDefined()
  })

  it('should show error message when error', () => {
    render(<EcuInfoPanel ecus={[]} loading={false} error={'Fallo'} selectedId={'audi-a3-idle'} />)

    expect(screen.getByText('Fallo')).toBeDefined()
  })

  it('should show table with ECU data', () => {
    render(
      <EcuInfoPanel ecus={sampleEcus} loading={false} error={null} selectedId={'audi-a3-idle'} />,
    )

    expect(screen.getByText('Engine Control Unit')).toBeDefined()
    expect(screen.getByText('7E0 → 7E8')).toBeDefined()
    expect(screen.getByText('ECM')).toBeDefined()
    expect(screen.getByText('ISO 15765-4 (CAN 11/500)')).toBeDefined()
  })

  it('should show empty ECUs message when list is empty and loaded', () => {
    render(<EcuInfoPanel ecus={[]} loading={false} error={null} selectedId={'audi-a3-idle'} />)

    expect(screen.getByText('Sin ECUs descubiertas')).toBeDefined()
  })
})
