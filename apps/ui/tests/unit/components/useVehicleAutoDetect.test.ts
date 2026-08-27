import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useVehicleAutoDetect } from '../../../src/components/dashboard/useVehicleAutoDetect'
import * as apiModule from '../../../src/lib/api'

vi.mock('../../../src/lib/api', () => ({
  api: {
    getVehicleInfo: vi.fn(),
    confirmVehicleIdentity: vi.fn(),
  },
}))

const mockApi = vi.mocked(apiModule.api)

const vehicle = {
  vin: 'WAUZZZ8V5JA123456',
  make: 'Audi',
  model: 'A3',
  year: 2018,
  engineType: '2.0 TFSI',
  manufacturer: 'Audi',
  region: { country: 'Germany', region: 'Europe' },
  modelYearDecoded: 2018,
}

describe('useVehicleAutoDetect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should start in the selecting step with no vehicle', () => {
    const { result } = renderHook(() => useVehicleAutoDetect())

    expect(result.current.step).toBe('selecting')
    expect(result.current.vehicle).toBeNull()
    expect(result.current.error).toBeNull()
    expect(mockApi.getVehicleInfo).not.toHaveBeenCalled()
  })

  it('should walk selecting → detecting → confirming → done', async () => {
    mockApi.getVehicleInfo.mockResolvedValue(vehicle)
    const { result } = renderHook(() => useVehicleAutoDetect())

    act(() => {
      result.current.detect('audi-a3-idle')
    })
    expect(result.current.step).toBe('detecting')
    expect(result.current.scenarioId).toBe('audi-a3-idle')

    await waitFor(() => expect(result.current.step).toBe('confirming'))
    expect(result.current.vehicle).toEqual(vehicle)
    expect(mockApi.getVehicleInfo).toHaveBeenCalledWith('audi-a3-idle')

    act(() => {
      result.current.confirm()
    })
    expect(result.current.step).toBe('done')
  })

  it('should expose a recoverable error when the detection fails', async () => {
    mockApi.getVehicleInfo.mockRejectedValueOnce(new Error('Scenario not found'))
    const { result } = renderHook(() => useVehicleAutoDetect())

    act(() => {
      result.current.detect('no-existe')
    })

    await waitFor(() => expect(result.current.error).toBe('Scenario not found'))
    expect(result.current.step).toBe('detecting')
    expect(result.current.vehicle).toBeNull()

    // Recuperable: reintentar repite la lectura del mismo escenario
    mockApi.getVehicleInfo.mockResolvedValueOnce(vehicle)
    act(() => {
      result.current.retry()
    })

    await waitFor(() => expect(result.current.step).toBe('confirming'))
    expect(result.current.error).toBeNull()
    expect(mockApi.getVehicleInfo).toHaveBeenLastCalledWith('no-existe')
  })

  it('should go back to selecting and drop the identified vehicle on restart', async () => {
    mockApi.getVehicleInfo.mockResolvedValue(vehicle)
    const { result } = renderHook(() => useVehicleAutoDetect())

    act(() => {
      result.current.detect('audi-a3-idle')
    })
    await waitFor(() => expect(result.current.step).toBe('confirming'))

    act(() => {
      result.current.restart()
    })

    expect(result.current.step).toBe('selecting')
    expect(result.current.vehicle).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should ignore a stale response when a second detection starts', async () => {
    const kawasaki = { ...vehicle, make: 'Kawasaki', model: 'Z900' }
    let resolveFirst: (v: typeof vehicle) => void = () => {}
    mockApi.getVehicleInfo
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockResolvedValueOnce(kawasaki)
    const { result } = renderHook(() => useVehicleAutoDetect())

    act(() => {
      result.current.detect('audi-a3-idle')
    })
    act(() => {
      result.current.detect('kawa-z900')
    })
    await waitFor(() => expect(result.current.step).toBe('confirming'))

    await act(async () => {
      resolveFirst(vehicle)
    })

    expect(result.current.vehicle).toEqual(kawasaki)
    expect(result.current.scenarioId).toBe('kawa-z900')
  })

  describe('saveIdentity', () => {
    /** Lleva el wizard hasta `confirming`, que es donde el mecanico corrige. */
    async function detectUntilConfirming() {
      mockApi.getVehicleInfo.mockResolvedValueOnce(vehicle)
      const hook = renderHook(() => useVehicleAutoDetect())
      act(() => {
        hook.result.current.detect('audi-a3-idle')
      })
      await waitFor(() => expect(hook.result.current.step).toBe('confirming'))
      return hook
    }

    it('envia la correccion al servidor y devuelve su confirmacion', async () => {
      const confirmation = {
        vehicle: { make: 'Audi', model: 'A3', year: 2018, engineType: '2.0 TFSI' },
        promoted: true,
        warnings: [],
      }
      mockApi.confirmVehicleIdentity.mockResolvedValueOnce(confirmation)
      const { result } = await detectUntilConfirming()

      let returned
      await act(async () => {
        returned = await result.current.saveIdentity({
          vin: 'WAUZZZ8V5JA123456',
          make: 'Audi',
        })
      })

      expect(mockApi.confirmVehicleIdentity).toHaveBeenCalledWith({
        vin: 'WAUZZZ8V5JA123456',
        make: 'Audi',
      })
      expect(returned).toEqual(confirmation)
    })

    // La regla que documenta el hook: ante un conflicto de WMI vale la marca ya
    // conocida, asi que la pantalla debe mostrar la del servidor y NO la tecleada.
    it('pinta lo que devuelve el servidor, no lo que se escribio', async () => {
      mockApi.confirmVehicleIdentity.mockResolvedValueOnce({
        vehicle: { make: 'Audi', model: 'A3', year: 2018, engineType: '2.0 TDI' },
        promoted: false,
        conflict: { known: 'Audi', claimed: 'Seat' },
        warnings: ['El WMI ya estaba asignado a Audi'],
      })
      const { result } = await detectUntilConfirming()

      await act(async () => {
        await result.current.saveIdentity({ vin: 'WAUZZZ8V5JA123456', make: 'Seat' })
      })

      expect(result.current.vehicle?.make).toBe('Audi')
      expect(result.current.vehicle?.engineType).toBe('2.0 TDI')
    })

    it('mantiene `manufacturer` alineado con la marca confirmada', async () => {
      mockApi.confirmVehicleIdentity.mockResolvedValueOnce({
        vehicle: { make: 'Cupra', model: 'Leon', year: 2021, engineType: '2.0 TSI' },
        promoted: true,
        warnings: [],
      })
      const { result } = await detectUntilConfirming()

      await act(async () => {
        await result.current.saveIdentity({ vin: 'VSSZZZKLZMR000111', make: 'Cupra' })
      })

      expect(result.current.vehicle?.manufacturer).toBe('Cupra')
      expect(result.current.vehicle?.model).toBe('Leon')
      expect(result.current.vehicle?.year).toBe(2021)
    })

    // Sin vehiculo en pantalla no hay nada que reescribir: guardar no debe
    // inventarse uno a partir de la respuesta.
    it('no crea un vehiculo cuando todavia no hay ninguno identificado', async () => {
      mockApi.confirmVehicleIdentity.mockResolvedValueOnce({
        vehicle: { make: 'Audi', model: 'A3', year: 2018, engineType: '2.0 TFSI' },
        promoted: true,
        warnings: [],
      })
      const { result } = renderHook(() => useVehicleAutoDetect())

      await act(async () => {
        await result.current.saveIdentity({ vin: 'WAUZZZ8V5JA123456', make: 'Audi' })
      })

      expect(result.current.vehicle).toBeNull()
    })
  })
})
