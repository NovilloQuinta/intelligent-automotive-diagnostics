import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loadConfig, assertProductionSecrets } from '@/infrastructure/configuration/index.js'

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

describe('loadConfig — OBD_READ_ONLY', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.OBD_READ_ONLY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('desactiva el modo solo-lectura por defecto', () => {
    expect(loadConfig().OBD_READ_ONLY).toBe(false)
  })

  it('activa el modo solo-lectura con OBD_READ_ONLY=true', () => {
    process.env.OBD_READ_ONLY = 'true'

    expect(loadConfig().OBD_READ_ONLY).toBe(true)
  })

  it('trata cualquier otro valor como desactivado', () => {
    process.env.OBD_READ_ONLY = 'false'
    expect(loadConfig().OBD_READ_ONLY).toBe(false)

    process.env.OBD_READ_ONLY = '0'
    expect(loadConfig().OBD_READ_ONLY).toBe(false)
  })
})

describe('loadConfig — RATE_LIMIT_ENABLED', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.RATE_LIMIT_ENABLED
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('queda sin definir si no se declara, para que mande NODE_ENV', () => {
    expect(loadConfig().RATE_LIMIT_ENABLED).toBeUndefined()
  })

  it('acepta true y false', () => {
    process.env.RATE_LIMIT_ENABLED = 'true'
    expect(loadConfig().RATE_LIMIT_ENABLED).toBe('true')

    process.env.RATE_LIMIT_ENABLED = 'false'
    expect(loadConfig().RATE_LIMIT_ENABLED).toBe('false')
  })

  it('trata el valor vacio como no declarado', () => {
    process.env.RATE_LIMIT_ENABLED = ''

    expect(loadConfig().RATE_LIMIT_ENABLED).toBeUndefined()
  })

  it('rechaza un valor que no sea true ni false', () => {
    // Un "yes" aceptado en silencio dejaria produccion sin rate limiting y
    // nadie se enteraria: mejor que el arranque falle.
    process.env.RATE_LIMIT_ENABLED = 'yes'

    expect(() => loadConfig()).toThrow()
  })
})

describe('loadConfig — TOTP_ENCRYPTION_KEY', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    delete process.env.TOTP_ENCRYPTION_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('trae un valor de desarrollo para que un clon limpio arranque', () => {
    expect(loadConfig().TOTP_ENCRYPTION_KEY).toBeTruthy()
  })

  it('el valor por defecto son 32 bytes en base64, utilizables tal cual', () => {
    const key = Buffer.from(loadConfig().TOTP_ENCRYPTION_KEY, 'base64')

    expect(key.byteLength).toBe(32)
  })

  it('respeta la clave indicada por entorno', () => {
    const key = Buffer.alloc(32, 7).toString('base64')
    process.env.TOTP_ENCRYPTION_KEY = key

    expect(loadConfig().TOTP_ENCRYPTION_KEY).toBe(key)
  })
})

describe('assertProductionSecrets — TOTP_ENCRYPTION_KEY', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  /** Config valida de produccion, salvo lo que cada test rompa a proposito. */
  function productionConfig() {
    process.env.NODE_ENV = 'production'
    process.env.ACCESS_TOKEN_SECRET = 'una-clave-de-acceso-larga-y-propia'
    process.env.REFRESH_TOKEN_SECRET = 'una-clave-de-refresco-larga-y-propia'
    return loadConfig()
  }

  it('rechaza arrancar en produccion con la clave de desarrollo', () => {
    // Con la clave por defecto, cualquiera con el repositorio descifra los
    // secretos TOTP de produccion: el segundo factor no valdria nada.
    const config = productionConfig()

    expect(() => assertProductionSecrets(config)).toThrow(/TOTP_ENCRYPTION_KEY/)
  })

  it('acepta una clave propia', () => {
    process.env.TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 42).toString('base64')

    expect(() => assertProductionSecrets(productionConfig())).not.toThrow()
  })

  it('fuera de produccion no exige nada', () => {
    process.env.NODE_ENV = 'development'

    expect(() => assertProductionSecrets(loadConfig())).not.toThrow()
  })
})
