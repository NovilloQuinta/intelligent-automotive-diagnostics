import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { PidsTable } from '../../../src/components/dashboard/PidsTable'
import type { PidRow } from '../../../src/components/dashboard/pidCatalog'

const NORMAL_VALUES = { rpm: 850, coolantTemp: 90, speed: 50, intakeTemp: 35 }

/**
 * Catalogo servido por `GET /api/available-pids` para las 4 lecturas fijas.
 *
 * La velocidad va deliberadamente sin ventana: el catalogo de dominio tampoco la
 * juzga, asi que su fila se pinta sin veredicto.
 */
const FIXED_CATALOG = [
  { code: '01 0C', name: 'Engine RPM', unit: 'rpm', operatingWindow: { max: 6500 } },
  { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C', operatingWindow: { max: 100 } },
  { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h' },
  { code: '01 0F', name: 'Intake Air Temperature', unit: '°C', operatingWindow: { max: 80 } },
]

function aiRow(code: string, description: string, value: string): PidRow {
  return { code, description, value, status: 'ok', source: 'ai' }
}

describe('PidsTable', () => {
  it('should render the empty prompt and a dash count when empty', () => {
    render(<PidsTable parsedValues={null} empty={true} />)

    expect(screen.getByText('Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO')).toBeDefined()
    expect(screen.getByText('—')).toBeDefined()
    expect(screen.queryByText('Código')).toBeNull()
  })

  it('should render neither the prompt nor the table while loading without a result yet', () => {
    render(<PidsTable parsedValues={null} empty={false} />)

    expect(screen.queryByText('Selecciona un vehículo y pulsa INICIAR DIAGNÓSTICO')).toBeNull()
    expect(screen.getByText('—')).toBeDefined()
    expect(screen.queryByText('Código')).toBeNull()
  })

  it('should list all 4 PIDs with their code, description and formatted value', () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} />)

    expect(screen.getByText('4 registrados')).toBeDefined()
    expect(screen.getByText('01 0C')).toBeDefined()
    expect(screen.getByText('Régimen del motor')).toBeDefined()
    expect(screen.getByText('850 RPM')).toBeDefined()
    expect(screen.getByText('01 05')).toBeDefined()
    expect(screen.getByText('Temperatura del refrigerante')).toBeDefined()
    expect(screen.getByText('90°C')).toBeDefined()
    expect(screen.getByText('01 0D')).toBeDefined()
    expect(screen.getByText('Velocidad del vehículo')).toBeDefined()
    expect(screen.getByText('50 km/h')).toBeDefined()
    expect(screen.getByText('01 0F')).toBeDefined()
    expect(screen.getByText('Temperatura del aire de admisión')).toBeDefined()
    expect(screen.getByText('35°C')).toBeDefined()
  })

  it('should mark every judged PID as OK when all values are within normal range', () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} availablePids={FIXED_CATALOG} />)

    // 3 y no 4: la velocidad no tiene ventana operativa, asi que no se juzga.
    expect(screen.getAllByText('OK')).toHaveLength(3)
    expect(screen.queryByText('Revisar')).toBeNull()
  })

  it('should judge no PID at all until the catalog with the windows arrives', () => {
    render(<PidsTable parsedValues={{ ...NORMAL_VALUES, rpm: 7000 }} empty={false} />)

    expect(screen.queryByText('OK')).toBeNull()
    expect(screen.queryByText('Revisar')).toBeNull()
    expect(screen.getByText('7000 RPM')).toBeDefined()
  })

  it('should mark RPM as Revisar above the catalog window, OK at the boundary', () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, rpm: 6500 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('OK')).toHaveLength(3)

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, rpm: 6501 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('Revisar')).toHaveLength(1)
    expect(screen.getAllByText('OK')).toHaveLength(2)
  })

  it('should mark coolant temp as Revisar above the catalog window, OK at the boundary', () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, coolantTemp: 100 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('OK')).toHaveLength(3)

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, coolantTemp: 101 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('Revisar')).toHaveLength(1)
  })

  it('should mark intake temp as Revisar above the catalog window, OK at the boundary', () => {
    const { rerender } = render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, intakeTemp: 80 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('OK')).toHaveLength(3)

    rerender(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, intakeTemp: 81 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )
    expect(screen.getAllByText('Revisar')).toHaveLength(1)
  })

  it('should leave speed unjudged, because the catalog defines no window for it', () => {
    // Antes se marcaba OK a cualquier velocidad — un veredicto inventado en la UI.
    // Sin ventana no hay criterio, y la fila se pinta sin insignia.
    render(
      <PidsTable
        parsedValues={{ ...NORMAL_VALUES, speed: 999 }}
        empty={false}
        availablePids={FIXED_CATALOG}
      />,
    )

    expect(screen.getAllByText('OK')).toHaveLength(3)
    expect(screen.queryByText('Revisar')).toBeNull()
    expect(screen.getByText('999 km/h')).toBeDefined()
  })

  it('should list the AI rows after the 4 fixed ones with an AI origin badge', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[
          aiRow('01 11', 'Posición del acelerador', '14 %'),
          aiRow('01 42', 'Voltaje del módulo de control', '14.2 V'),
        ]}
        aiLoading={false}
      />,
    )

    expect(screen.getByText('6 registrados')).toBeDefined()
    expect(screen.getByText('01 11')).toBeDefined()
    expect(screen.getByText('01 42')).toBeDefined()
    expect(screen.getAllByText('IA')).toHaveLength(2)

    const codes = screen.getAllByTestId('pid-row').map((row) => row.getAttribute('data-code'))
    expect(codes).toEqual(['01 0C', '01 05', '01 0D', '01 0F', '01 11', '01 42'])
  })

  it('should not duplicate a row when the AI reads an already fixed PID', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[aiRow('01 0C', 'Régimen del motor', '999 rpm')]}
        aiLoading={false}
      />,
    )

    expect(screen.getByText('4 registrados')).toBeDefined()
    expect(screen.getAllByText('01 0C')).toHaveLength(1)
    expect(screen.getByText('850 RPM')).toBeDefined()
    expect(screen.queryByText('IA')).toBeNull()
  })

  it('should show a secondary loading indicator without hiding the fixed rows', () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} aiRows={null} aiLoading={true} />)

    expect(screen.getByText('Buscando PIDs adicionales…')).toBeDefined()
    expect(screen.getByText('01 0C')).toBeDefined()
    expect(screen.getAllByTestId('pid-row')).toHaveLength(4)
  })

  it('should show a brief failure notice when the AI search errored with no rows', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[]}
        aiLoading={false}
        aiError={{ kind: 'timeout', message: 'La petición tardó demasiado' }}
      />,
    )

    expect(screen.getByText(/no se pudieron buscar/i)).toBeDefined()
  })

  it('should not show a failure notice when there are no AI rows and no error', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        aiRows={[]}
        aiLoading={false}
        aiError={null}
      />,
    )

    expect(screen.queryByText(/no se pudieron buscar/i)).toBeNull()
  })

  it('should render neither the loading row nor AI rows when the capability is off', () => {
    const { rerender } = render(
      <PidsTable parsedValues={NORMAL_VALUES} empty={false} aiRows={null} aiLoading={false} />,
    )
    expect(screen.queryByText('Buscando PIDs adicionales…')).toBeNull()
    expect(screen.getAllByTestId('pid-row')).toHaveLength(4)

    rerender(<PidsTable parsedValues={NORMAL_VALUES} empty={false} aiRows={[]} aiLoading={false} />)
    expect(screen.queryByText('Buscando PIDs adicionales…')).toBeNull()
    expect(screen.queryByText('IA')).toBeNull()
    expect(screen.getAllByTestId('pid-row')).toHaveLength(4)
  })
})

describe('PidsTable — selectable', () => {
  const EXTRA_MODE01_ROWS: PidRow[] = [
    aiRow('01 11', 'Posición del acelerador', '14 %'),
    aiRow('01 42', 'Voltaje del módulo de control', '14.2 V'),
    aiRow('01 04', 'Carga calculada del motor', '20 %'),
    aiRow('01 0B', 'Presión del colector', '98 kPa'),
    aiRow('01 0E', 'Ángulo de avance', '10 °'),
  ]

  function checkedLabels(): string[] {
    return screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).checked)
      .map((c) => (c as HTMLInputElement).getAttribute('aria-label') ?? '')
  }

  it('should render one checkbox per Mode 01 row when selectable', () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} selectable />)

    expect(screen.getAllByRole('checkbox')).toHaveLength(4)
  })

  it('should mark the 4 default PIDs as checked by default', () => {
    render(<PidsTable parsedValues={NORMAL_VALUES} empty={false} selectable />)

    expect(checkedLabels()).toEqual([
      'Seleccionar PID 0C',
      'Seleccionar PID 05',
      'Seleccionar PID 0D',
      'Seleccionar PID 0F',
    ])
  })

  it('should render checkboxes only for Mode 01 PIDs, not Mode 22 proprietary ones', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        aiRows={[
          aiRow('01 11', 'Posición del acelerador', '14 %'),
          aiRow('22 1A2B', 'PID propietario del fabricante', '42'),
        ]}
        aiLoading={false}
      />,
    )

    expect(screen.getAllByRole('checkbox')).toHaveLength(5)
    expect(screen.queryByLabelText('Seleccionar PID 1A2B')).toBeNull()
  })

  it('should ignore the ninth selection and show the limit tooltip', () => {
    function Selectable() {
      const [pids, setPids] = useState<string[]>(['0C', '05', '0D', '0F'])
      return (
        <PidsTable
          parsedValues={NORMAL_VALUES}
          empty={false}
          selectable
          selectedPids={pids}
          onPidsChange={setPids}
          aiRows={EXTRA_MODE01_ROWS}
          aiLoading={false}
        />
      )
    }
    render(<Selectable />)

    for (const code of ['11', '42', '04', '0B']) {
      fireEvent.click(screen.getByRole('checkbox', { name: `Seleccionar PID ${code}` }))
    }
    expect(checkedLabels()).toHaveLength(8)

    const ninth = screen.getByRole('checkbox', { name: 'Seleccionar PID 0E' })
    expect((ninth as HTMLInputElement).disabled).toBe(true)
    fireEvent.click(ninth)
    expect(checkedLabels()).toHaveLength(8)
    expect(screen.getByTitle('Máximo 8 PIDs')).toBeDefined()
  })

  it('should emit the short selected codes through onPidsChange when deselecting', () => {
    const onPidsChange = vi.fn()
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        onPidsChange={onPidsChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar PID 0C' }))

    expect(onPidsChange).toHaveBeenLastCalledWith(['05', '0D', '0F'])
  })

  it('should emit the short code of a newly selected PID through onPidsChange', () => {
    const onPidsChange = vi.fn()
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        onPidsChange={onPidsChange}
        aiRows={[aiRow('01 11', 'Posición del acelerador', '14 %')]}
        aiLoading={false}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar PID 11' }))

    expect(onPidsChange).toHaveBeenLastCalledWith(['0C', '05', '0D', '0F', '11'])
  })

  it('should not count orphan selected codes toward the 8-PID limit', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        // 7 valid selections + 1 orphan "10" (no row) = 8 entries, only 7 visible
        selectedPids={['0C', '05', '0D', '0F', '11', '42', '04', '10']}
        aiRows={EXTRA_MODE01_ROWS}
        aiLoading={false}
      />,
    )

    expect(screen.queryByLabelText('Seleccionar PID 10')).toBeNull()
    expect(checkedLabels()).toHaveLength(7)

    // Only 7 are effectively selected, so valid unselected rows stay enabled
    const next = screen.getByRole('checkbox', { name: 'Seleccionar PID 0B' })
    expect((next as HTMLInputElement).disabled).toBe(false)
  })

  it('should emit the pruned list when orphan selected codes are detected', async () => {
    const onPidsChange = vi.fn()
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        selectedPids={['0C', '05', '0D', '0F', '11']}
        onPidsChange={onPidsChange}
        aiRows={null}
        aiLoading={false}
      />,
    )

    await waitFor(() => {
      expect(onPidsChange).toHaveBeenCalledWith(['0C', '05', '0D', '0F'])
    })
  })
})

describe('PidsTable — catalog', () => {
  const CATALOG = [
    { code: '01 0C', name: 'Engine RPM', unit: 'rpm' },
    { code: '01 05', name: 'Engine Coolant Temperature', unit: '°C' },
    { code: '01 0D', name: 'Vehicle Speed', unit: 'km/h' },
    { code: '01 0F', name: 'Intake Air Temperature', unit: '°C' },
    { code: '01 11', name: 'Throttle Position', unit: '%' },
    { code: '01 42', name: 'Control Module Voltage', unit: 'V' },
  ]

  it('renders every catalog Mode 01 PID as a selectable row', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        availablePids={CATALOG}
        readings={null}
      />,
    )

    expect(screen.getAllByTestId('pid-row')).toHaveLength(6)
    expect(screen.getAllByRole('checkbox')).toHaveLength(6)
    expect(screen.getByText('6 registrados')).toBeDefined()
    expect(screen.getByText('Throttle Position')).toBeDefined()
  })

  it('keeps the 4 default PIDs checked and renders non-fixed catalog PIDs without verdict', () => {
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        availablePids={CATALOG}
        readings={null}
      />,
    )

    const checked = screen
      .getAllByRole('checkbox')
      .filter((c) => (c as HTMLInputElement).checked)
      .map((c) => (c as HTMLInputElement).getAttribute('aria-label'))
    expect(checked).toEqual([
      'Seleccionar PID 0C',
      'Seleccionar PID 05',
      'Seleccionar PID 0D',
      'Seleccionar PID 0F',
    ])
    // Catalog-only rows (e.g. 01 11) have no OK/Revisar verdict: value `—`.
    expect(screen.getByText('01 11')).toBeDefined()
  })

  it('emits the newly selected catalog PID through onPidsChange', () => {
    const onPidsChange = vi.fn()
    render(
      <PidsTable
        parsedValues={NORMAL_VALUES}
        empty={false}
        selectable
        availablePids={CATALOG}
        readings={null}
        onPidsChange={onPidsChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar PID 11' }))

    expect(onPidsChange).toHaveBeenLastCalledWith(['0C', '05', '0D', '0F', '11'])
  })
})
