import { describe, it, expect } from 'vitest'
import type { Elm327Transport } from '@/application/ports/Elm327Transport.js'

/**
 * Verifica que la interfaz Elm327Transport define el contrato correcto
 * para que las implementaciones (TCP, Serial) sean intercambiables.
 *
 * Al ser una interfaz TypeScript (sin runtime), este test valida:
 * 1. Que la interfaz existe y es importable
 * 2. Que un objeto con los métodos esperados satisface el tipado estructural
 * 3. Que los métodos devuelven los tipos correctos
 */
describe('Elm327Transport interface', () => {
  it('should accept objects with connect, sendCommand, and close methods', () => {
    const mockTransport: Elm327Transport = {
      connect: async () => {
        /* no-op */
      },
      sendCommand: async (_cmd: string) => 'OK\r\r>',
      close: async () => {
        /* no-op */
      },
    }

    expect(typeof mockTransport.connect).toBe('function')
    expect(typeof mockTransport.sendCommand).toBe('function')
    expect(typeof mockTransport.close).toBe('function')
  })

  it('connect() should return Promise<void>', async () => {
    const transport: Elm327Transport = {
      connect: async () => {
        /* no-op */
      },
      sendCommand: async (_cmd: string) => 'OK\r\r>',
      close: async () => {
        /* no-op */
      },
    }

    const result = transport.connect()
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('sendCommand() should return Promise<string>', async () => {
    const transport: Elm327Transport = {
      connect: async () => {
        /* no-op */
      },
      sendCommand: async (_cmd: string) => 'AT\rOK\r\r>',
      close: async () => {
        /* no-op */
      },
    }

    const result = transport.sendCommand('AT')
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBe('AT\rOK\r\r>')
  })

  it('close() should return Promise<void>', async () => {
    const transport: Elm327Transport = {
      connect: async () => {
        /* no-op */
      },
      sendCommand: async (_cmd: string) => 'OK\r\r>',
      close: async () => {
        /* no-op */
      },
    }

    const result = transport.close()
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })
})
