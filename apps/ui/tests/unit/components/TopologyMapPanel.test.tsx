import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TopologyMapPanel } from '../../../src/components/dashboard/TopologyMapPanel'
import { getEcuTopologyColor } from '../../../src/components/dashboard/ecuTopologyColors'
import type { EcuInfo } from '../../../src/components/dashboard/types'

function ecu(name: string, type: string, req: string, res: string): EcuInfo {
  return {
    id: 0,
    vehicleId: 1,
    name,
    requestAddr: req,
    responseAddr: res,
    type,
    protocol: 'ISO 15765-4 CAN',
  }
}

/** Fixture tipo Audi A3: cinco ECUs, una por sistema. */
const AUDI_ECUS: EcuInfo[] = [
  ecu('Motor', 'ECM', '7E0', '7E8'),
  ecu('Cambio', 'TCM', '7E1', '7E9'),
  ecu('Frenos ABS', 'ABS', '7E2', '7EA'),
  ecu('Confort', 'BCM', '7E3', '7EB'),
  ecu('Airbag', 'SRS', '7E4', '7EC'),
]

/** Fixture tipo Kawasaki Z900: tres ECUs. */
const MOTO_ECUS: EcuInfo[] = [
  ecu('Motor', 'ECM', '7E0', '7E8'),
  ecu('Frenos', 'ABS', '7E2', '7EA'),
  ecu('Cuadro', 'IPC', '7E5', '7ED'),
]

const BASE = { loading: false, error: null, selectedId: 'audi-a3-idle' }

describe('TopologyMapPanel', () => {
  describe('estados', () => {
    it('sin vehiculo seleccionado invita a seleccionar uno', () => {
      render(<TopologyMapPanel {...BASE} selectedId={null} ecus={[]} />)
      expect(screen.getByText(/selecciona un veh/i)).toBeInTheDocument()
    })

    it('muestra estado de carga', () => {
      render(<TopologyMapPanel {...BASE} loading ecus={[]} />)
      expect(screen.getByText(/cargando/i)).toBeInTheDocument()
    })

    it('muestra el error recibido', () => {
      render(<TopologyMapPanel {...BASE} error="Bus CAN no responde" ecus={[]} />)
      expect(screen.getByText('Bus CAN no responde')).toBeInTheDocument()
    })

    it('con lista vacia muestra el mismo mensaje que EcuInfoPanel', () => {
      render(<TopologyMapPanel {...BASE} ecus={[]} />)
      expect(screen.getByText('Sin ECUs descubiertas')).toBeInTheDocument()
    })
  })

  describe('nodos', () => {
    it('dibuja un nodo por ECU (5 ECUs)', () => {
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)
      expect(
        screen.getAllByRole('button', { name: /motor|cambio|frenos|confort|airbag/i }),
      ).toHaveLength(5)
    })

    it('dibuja un nodo por ECU (3 ECUs)', () => {
      render(<TopologyMapPanel {...BASE} ecus={MOTO_ECUS} />)
      expect(screen.getAllByRole('button', { name: /motor|frenos|cuadro/i })).toHaveLength(3)
    })

    it('no coloca dos nodos en la misma posicion', () => {
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)
      const positions = screen
        .getAllByRole('button', { name: /motor|cambio|frenos|confort|airbag/i })
        .map((node) => node.getAttribute('transform'))
      expect(new Set(positions).size).toBe(AUDI_ECUS.length)
    })

    it('con una unica ECU avisa de la limitacion del descubrimiento', () => {
      render(<TopologyMapPanel {...BASE} ecus={[AUDI_ECUS[0]]} />)
      expect(screen.getAllByRole('button', { name: /motor/i })).toHaveLength(1)
      expect(screen.getByText(/una sola ecu/i)).toBeInTheDocument()
    })

    it('colorea cada nodo segun su tipo', () => {
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)
      const abs = screen.getByRole('button', { name: /frenos abs/i })
      expect(abs.querySelector('circle')).toHaveAttribute('fill', getEcuTopologyColor('ABS'))
    })
  })

  describe('seleccion de nodo', () => {
    it('al pulsar un nodo muestra su detalle', async () => {
      const user = userEvent.setup()
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)

      await user.click(screen.getByRole('button', { name: /cambio/i }))

      expect(screen.getByText('7E1 → 7E9')).toBeInTheDocument()
      expect(screen.getByText(/ISO 15765-4 CAN/)).toBeInTheDocument()
    })

    it('se puede seleccionar un nodo con el teclado', async () => {
      const user = userEvent.setup()
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)

      screen.getByRole('button', { name: /frenos abs/i }).focus()
      await user.keyboard('{Enter}')

      expect(screen.getByText('7E2 → 7EA')).toBeInTheDocument()
    })

    it('al pulsar otro nodo reemplaza el detalle en vez de acumularlo', async () => {
      const user = userEvent.setup()
      render(<TopologyMapPanel {...BASE} ecus={AUDI_ECUS} />)

      await user.click(screen.getByRole('button', { name: /cambio/i }))
      await user.click(screen.getByRole('button', { name: /airbag/i }))

      expect(screen.getByText('7E4 → 7EC')).toBeInTheDocument()
      expect(screen.queryByText('7E1 → 7E9')).not.toBeInTheDocument()
    })
  })
})
