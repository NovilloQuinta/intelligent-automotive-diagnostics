import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createServer } from '@/infrastructure/http/server.js'
import type { SimulationScenario } from '@/infrastructure/hardware-simulator/simulationScenario.js'

const mockScenarios: SimulationScenario[] = [
  {
    id: 'audi-a3-idle',
    name: 'Audi A3 al ralentí',
    vehicleType: 'car',
    sensorValues: { rpm: 750, coolantTemp: 90, speed: 0, intakeTemp: 25 },
    dtcConfig: [{ code: 'P0301', description: 'Cylinder 1 Misfire' }],
  },
]

let baseUrl: string
let httpServer: Server

beforeAll(async () => {
  const app = createServer(mockScenarios)
  await new Promise<void>((resolve) => {
    httpServer = app.listen(0, () => resolve())
  })
  const { port } = httpServer.address() as AddressInfo
  baseUrl = `http://localhost:${port}`
})

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
})

describe('HTTP server', () => {
  it('should return scenarios on GET /api/scenarios', async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`)
    const body = (await res.json()) as { scenarios: unknown[] }

    expect(res.status).toBe(200)
    expect(body.scenarios).toHaveLength(1)
    expect(body.scenarios[0]).toHaveProperty('id', 'audi-a3-idle')
  })

  it('should return diagnosis on POST /api/diagnosis', async () => {
    const res = await fetch(`${baseUrl}/api/diagnosis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'audi-a3-idle' }),
    })
    const body = (await res.json()) as { severity: string }

    expect(res.status).toBe(200)
    expect(body.severity).toBe('critical')
  })

  it('should return 404 for unknown scenario', async () => {
    const res = await fetch(`${baseUrl}/api/diagnosis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId: 'nonexistent' }),
    })
    const body = (await res.json()) as { error: string }

    expect(res.status).toBe(404)
    expect(body.error).toBe('Scenario not found')
  })

  it('should have CORS headers', async () => {
    const res = await fetch(`${baseUrl}/api/scenarios`)

    expect(res.headers.get('access-control-allow-origin')).toBe('*')
  })
})
