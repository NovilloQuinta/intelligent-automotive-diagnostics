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
