import { describe, it, expect, vi } from 'vitest'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import type { Elm327TransportPort } from '@/application/ports/Elm327TransportPort.js'
import type { VehicleRepository } from '@/application/ports/VehicleRepository.js'

/**
 * Trafico que una lectura de PID pone en el bus del vehiculo.
 *
 * Con sesion de diagnostico activa, `read_pid` persistia la lectura releyendo
 * el mismo PID para quedarse con los bytes crudos: dos preguntas al coche por
 * cada valor que ve el mecanico. En un bus real eso es el doble de trafico en
 * justo la parte que mas se usa, asi que la lectura debe resolverse de una
 * sola pasada.
 */

/** RPM a 800: respuesta del emulador a `01 0C`. */
const RPM_RESPONSE = '01 0C\r41 0C 0C 80 \r\r>'

function createRecordingTransport(): { transport: Elm327TransportPort; sent: string[] } {
  const sent: string[] = []
  const transport: Elm327TransportPort = {
    connect: async () => {},
    close: async () => {},
    sendCommand: async (cmd: string) => {
      sent.push(cmd)
      return RPM_RESPONSE
    },
  }
  return { transport, sent }
}

function stubVehicleRepo(overrides: Partial<VehicleRepository> = {}): VehicleRepository {
  return {
    upsertVehicle: vi.fn(),
    findVehicleByVin: vi.fn(),
    insertEcu: vi.fn(),
    findEcusByVehicle: vi.fn(),
    insertPidDefinition: vi.fn(),
    findPidDefinition: vi.fn().mockResolvedValue(null),
    findPidsByManufacturerModel: vi.fn().mockResolvedValue([]),
    findPidsByMode: vi.fn(),
    insertPidReading: vi.fn(),
    createSession: vi.fn(),
    endSession: vi.fn(),
    findSessions: vi.fn(),
    findSessionById: vi.fn(),
    findDtcDefinition: vi.fn(),
    upsertDtcDefinition: vi.fn(),
    findDtcDefinitionByCode: vi.fn().mockResolvedValue(null),
    findEcuByAddress: vi.fn(),
    updateEcuDiscoveredAt: vi.fn(),
    findEcuDefinitionByAddress: vi.fn().mockResolvedValue(null),
    upsertEcuDefinition: vi.fn(),
    ...overrides,
  } as unknown as VehicleRepository
}

describe('read_pid — trafico en el bus', () => {
  it('should ask the vehicle exactly once per PID when a session is active', async () => {
    const { transport, sent } = createRecordingTransport()
    const insertPidReading = vi.fn().mockResolvedValue(undefined)
    const vehicleRepo = stubVehicleRepo({ insertPidReading })
    const repo = new Elm327TcpRepository(transport, vehicleRepo)
    const mcp = createMcpServer(repo, vehicleRepo, undefined, undefined, {
      sessionId: 1,
      vehicleId: 1,
    })

    await mcp.callTool('read_pid', { mode: '01', pid: '0C' })
    await vi.waitFor(() => expect(insertPidReading).toHaveBeenCalled())

    expect(sent).toEqual(['01 0C'])
  })

  it('should persist the raw bytes it already read, without a second round trip', async () => {
    const { transport, sent } = createRecordingTransport()
    const insertPidReading = vi.fn().mockResolvedValue(undefined)
    const vehicleRepo = stubVehicleRepo({ insertPidReading })
    const repo = new Elm327TcpRepository(transport, vehicleRepo)
    const mcp = createMcpServer(repo, vehicleRepo, undefined, undefined, {
      sessionId: 1,
      vehicleId: 1,
    })

    await mcp.callTool('read_pid', { mode: '01', pid: '0C' })
    await vi.waitFor(() => expect(insertPidReading).toHaveBeenCalled())

    // El hex persistido sigue siendo el real, no el fallback '00'.
    const reading = insertPidReading.mock.calls[0][0] as { rawHex: string; parsedValue: number }
    expect(reading.rawHex).toBe('0C80')
    expect(reading.parsedValue).toBe(800)
    expect(sent).toHaveLength(1)
  })
})
