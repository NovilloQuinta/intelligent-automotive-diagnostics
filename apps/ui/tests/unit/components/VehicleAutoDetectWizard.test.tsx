import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { VehicleAutoDetectWizard } from '../../../src/components/dashboard/VehicleAutoDetectWizard'
import type { Scenario, VehicleInfoResponse } from '../../../src/components/dashboard/types'

const scenarios: Scenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: 'car',
    connectionType: 'wifi',
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Audi',
      model: 'A3',
      year: 2018,
      engineType: '2.0 TFSI',
      vin: 'WAUZZZ8V5JA123456',
    },
  },
  {
    id: 'kawa-z900',
    name: 'Kawasaki Z900',
    vehicleType: 'motorcycle',
    connectionType: 'usb',
    sensorValues: { rpm: 4500, coolantTemp: 105, speed: 0, intakeTemp: 28 },
    dtcConfig: [],
    vehicleInfo: {
      make: 'Kawasaki',
      model: 'Z900',
      year: 2020,
      engineType: '948cc',
      vin: 'JKAZR2A1XLA000111',
    },
  },
]

const vehicle: VehicleInfoResponse = {
  vin: 'WAUZZZ8V5JA123456',
  make: 'Audi',
  model: 'A3',
  year: 2018,
  engineType: '2.0 TFSI',
  manufacturer: 'Audi',
  region: { country: 'Germany', region: 'Europe' },
  modelYearDecoded: 2018,
}

function renderWizard(overrides: Partial<Parameters<typeof VehicleAutoDetectWizard>[0]> = {}) {
  const props = {
    scenarios,
    step: 'selecting' as const,
    scenarioId: '',
    vehicle: null,
    error: null,
    onSelect: vi.fn(),
    onRetry: vi.fn(),
    onBack: vi.fn(),
    onConfirm: vi.fn(),
    onSaveIdentity: vi.fn(),
    ...overrides,
  }
  render(<VehicleAutoDetectWizard {...props} />)
  return props
}

describe('VehicleAutoDetectWizard', () => {
  describe('step: selecting', () => {
    it('should list the available connections', () => {
      renderWizard()

      expect(screen.getByText('Audi A3 al ralentí')).toBeDefined()
      expect(screen.getByText('Kawasaki Z900')).toBeDefined()
      expect(screen.getByText('Identificación del vehículo')).toBeDefined()
    })

    it('should call onSelect with the chosen scenario id', () => {
      const props = renderWizard()

      fireEvent.click(screen.getByText('Kawasaki Z900'))

      expect(props.onSelect).toHaveBeenCalledWith('kawa-z900')
    })

    it('should show an empty state when there are no connections', () => {
      renderWizard({ scenarios: [] })

      expect(screen.getByText('No hay conexiones disponibles')).toBeDefined()
    })

    it('should display the connection type in each ConnectionButton', () => {
      renderWizard()

      expect(screen.getByTestId('connection-type-audi-a3-idle')).toBeDefined()
      expect(screen.getByTestId('connection-type-kawa-z900')).toBeDefined()
    })
  })

  describe('step: detecting', () => {
    it('should show the scanning state while the VIN is read', () => {
      renderWizard({ step: 'detecting', scenarioId: 'audi-a3-idle' })

      expect(screen.getByText('Detectando vehículo…')).toBeDefined()
      expect(screen.getByTestId('autodetect-spinner')).toBeDefined()
      expect(screen.queryByText('Entrar a diagnóstico')).toBeNull()
    })

    it('should show a recoverable error with retry and back actions', () => {
      const props = renderWizard({
        step: 'detecting',
        scenarioId: 'no-existe',
        error: 'Scenario not found',
      })

      expect(screen.getByText('Scenario not found')).toBeDefined()
      expect(screen.queryByTestId('autodetect-spinner')).toBeNull()

      fireEvent.click(screen.getByText('Reintentar'))
      expect(props.onRetry).toHaveBeenCalledTimes(1)

      fireEvent.click(screen.getByText('Elegir otro vehículo'))
      expect(props.onBack).toHaveBeenCalledTimes(1)
    })
  })

  describe('step: confirming', () => {
    it('should show the identified vehicle card with the decoded VIN', () => {
      renderWizard({ step: 'confirming', scenarioId: 'audi-a3-idle', vehicle })

      expect(screen.getByText('WAUZZZ8V5JA123456')).toBeDefined()
      // "Audi" y "2018" salen dos veces: dato del escenario y dato decodificado del VIN
      expect(screen.getAllByText('Audi')).toHaveLength(2)
      expect(screen.getByText('A3')).toBeDefined()
      expect(screen.getAllByText('2018')).toHaveLength(2)
      expect(screen.getByText('2.0 TFSI')).toBeDefined()
      expect(screen.getByText('Germany · Europe')).toBeDefined()
    })

    it('should show a dash for the fields that the VIN does not decode', () => {
      renderWizard({
        step: 'confirming',
        scenarioId: 'tcp',
        vehicle: {
          ...vehicle,
          vin: 'XXXXXXXXXXXXXXXXX',
          manufacturer: null,
          region: null,
          modelYearDecoded: null,
        },
      })

      expect(screen.getByText('VIN no decodificable')).toBeDefined()
    })

    it('should call onConfirm with the scenario id', () => {
      const props = renderWizard({
        step: 'confirming',
        scenarioId: 'audi-a3-idle',
        vehicle,
      })

      fireEvent.click(screen.getByText('Entrar a diagnóstico'))

      expect(props.onConfirm).toHaveBeenCalledWith('audi-a3-idle')
    })
  })

  describe('step: confirming — corrección del mecánico', () => {
    /** Coche que la cascada no supo identificar: el caso que abre el formulario. */
    const unidentified: VehicleInfoResponse = {
      vin: 'VR3ABCDEFM1234567',
      make: 'unknown',
      model: 'unknown',
      year: 2021,
      engineType: 'unknown',
      manufacturer: null,
      region: { country: 'France', region: 'Europe' },
      modelYearDecoded: 2021,
    }

    it('ofrece corregir cuando el vehículo no se ha identificado', () => {
      renderWizard({ step: 'confirming', scenarioId: 'tcp', vehicle: unidentified })

      expect(screen.getByText('Identificar a mano')).toBeDefined()
    })

    it('no molesta con el formulario cuando el coche ya está identificado', () => {
      renderWizard({ step: 'confirming', scenarioId: 'audi-a3-idle', vehicle })

      expect(screen.queryByText('Identificar a mano')).toBeNull()
    })

    it('envía marca y modelo, y el VIN leído del coche', async () => {
      const onSaveIdentity = vi.fn().mockResolvedValue({
        vehicle: { make: 'Peugeot', model: '208', year: 2021, engineType: 'unknown' },
        promoted: true,
        warnings: [],
      })
      renderWizard({
        step: 'confirming',
        scenarioId: 'tcp',
        vehicle: unidentified,
        onSaveIdentity,
      })

      fireEvent.click(screen.getByText('Identificar a mano'))
      fireEvent.change(screen.getByLabelText('Marca'), {
        target: { value: 'Peugeot' },
      })
      fireEvent.change(screen.getByLabelText('Modelo'), { target: { value: '208' } })
      fireEvent.click(screen.getByText('Guardar identificación'))

      await waitFor(() =>
        expect(onSaveIdentity).toHaveBeenCalledWith({
          vin: 'VR3ABCDEFM1234567',
          make: 'Peugeot',
          model: '208',
        }),
      )
    })

    it('no deja guardar sin marca: es la única clave del catálogo', () => {
      const onSaveIdentity = vi.fn()
      renderWizard({
        step: 'confirming',
        scenarioId: 'tcp',
        vehicle: unidentified,
        onSaveIdentity,
      })

      fireEvent.click(screen.getByText('Identificar a mano'))
      fireEvent.click(screen.getByText('Guardar identificación'))

      expect(onSaveIdentity).not.toHaveBeenCalled()
    })

    it('avisa cuando el servidor conserva la marca que ya conocía', async () => {
      const onSaveIdentity = vi.fn().mockResolvedValue({
        vehicle: { make: 'Peugeot', model: '208', year: 2021, engineType: 'unknown' },
        promoted: false,
        conflict: { known: 'Peugeot', claimed: 'Ferrari' },
        warnings: [],
      })
      renderWizard({
        step: 'confirming',
        scenarioId: 'tcp',
        vehicle: unidentified,
        onSaveIdentity,
      })

      fireEvent.click(screen.getByText('Identificar a mano'))
      fireEvent.change(screen.getByLabelText('Marca'), {
        target: { value: 'Ferrari' },
      })
      fireEvent.click(screen.getByText('Guardar identificación'))

      expect(await screen.findByText(/ya está registrado como Peugeot/)).toBeDefined()
    })

    it('muestra los avisos de incoherencia que devuelve el servidor', async () => {
      const onSaveIdentity = vi.fn().mockResolvedValue({
        vehicle: { make: 'Peugeot', model: '208', year: 2015, engineType: 'unknown' },
        promoted: true,
        warnings: ['El año indicado (2015) no coincide con el que codifica el VIN (2021).'],
      })
      renderWizard({
        step: 'confirming',
        scenarioId: 'tcp',
        vehicle: unidentified,
        onSaveIdentity,
      })

      fireEvent.click(screen.getByText('Identificar a mano'))
      fireEvent.change(screen.getByLabelText('Marca'), {
        target: { value: 'Peugeot' },
      })
      fireEvent.click(screen.getByText('Guardar identificación'))

      expect(await screen.findByText(/no coincide con el que codifica el VIN/)).toBeDefined()
    })
  })
})
