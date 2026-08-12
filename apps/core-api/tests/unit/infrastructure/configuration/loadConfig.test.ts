import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig } from '@/infrastructure/configuration/index.js'

describe('loadConfig — LANCEDB_PATH', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.LANCEDB_PATH
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('usa data/lancedb como valor por defecto', () => {
    expect(loadConfig().LANCEDB_PATH).toBe('data/lancedb')
  })

  it('respeta la ruta indicada por entorno', () => {
    process.env.LANCEDB_PATH = '/var/lib/diagnostics/vectors'

    expect(loadConfig().LANCEDB_PATH).toBe('/var/lib/diagnostics/vectors')
  })

  it('rechaza una ruta vacia', () => {
    process.env.LANCEDB_PATH = ''

    expect(() => loadConfig()).toThrow()
  })
})

describe('loadConfig — OBD_MODE serial', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('acepta OBD_MODE=serial', () => {
    process.env.OBD_MODE = 'serial'
    expect(loadConfig().OBD_MODE).toBe('serial')
  })

  it('SERIAL_PORT_PATH por defecto es /dev/ttyUSB0', () => {
    process.env.OBD_MODE = 'serial'
    expect(loadConfig().SERIAL_PORT_PATH).toBe('/dev/ttyUSB0')
  })

  it('SERIAL_BAUD_RATE por defecto es 38400', () => {
    process.env.OBD_MODE = 'serial'
    expect(loadConfig().SERIAL_BAUD_RATE).toBe(38400)
  })

  it('respeta SERIAL_PORT_PATH configurado', () => {
    process.env.OBD_MODE = 'serial'
    process.env.SERIAL_PORT_PATH = '/dev/ttyAMA0'
    expect(loadConfig().SERIAL_PORT_PATH).toBe('/dev/ttyAMA0')
  })

  it('respeta SERIAL_BAUD_RATE configurado', () => {
    process.env.OBD_MODE = 'serial'
    process.env.SERIAL_BAUD_RATE = '9600'
    expect(loadConfig().SERIAL_BAUD_RATE).toBe(9600)
  })

  it('valida correctamente con OBD_MODE=serial y SERIAL_PORT_PATH=/dev/ttyAMA0', () => {
    process.env.OBD_MODE = 'serial'
    process.env.SERIAL_PORT_PATH = '/dev/ttyAMA0'
    const config = loadConfig()
    expect(config.OBD_MODE).toBe('serial')
    expect(config.SERIAL_PORT_PATH).toBe('/dev/ttyAMA0')
  })
})

describe('loadConfig — TTL de tokens JWT', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.ACCESS_TOKEN_TTL
    delete process.env.REFRESH_TOKEN_TTL
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('usa 900s (15m) y 604800s (7d) por defecto', () => {
    const config = loadConfig()
    expect(config.ACCESS_TOKEN_TTL).toBe(900)
    expect(config.REFRESH_TOKEN_TTL).toBe(604800)
  })

  it('respeta los TTL indicados por entorno', () => {
    process.env.ACCESS_TOKEN_TTL = '1800'
    process.env.REFRESH_TOKEN_TTL = '2592000'

    const config = loadConfig()
    expect(config.ACCESS_TOKEN_TTL).toBe(1800)
    expect(config.REFRESH_TOKEN_TTL).toBe(2592000)
  })

  it('rechaza un TTL no positivo', () => {
    process.env.ACCESS_TOKEN_TTL = '0'
    expect(() => loadConfig()).toThrow()
  })
})
