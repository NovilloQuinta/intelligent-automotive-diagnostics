import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Options } from 'express-rate-limit'
import { sql } from 'drizzle-orm'
import { getDb, resetDb } from '@/infrastructure/persistence/sqlite/db.js'
import type { DiagnosticsDb } from '@/infrastructure/persistence/sqlite/db.js'
import { SqliteRateLimitStore } from '@/infrastructure/persistence/sqlite/rateLimitStore.js'

const ONE_MINUTE_MS = 60_000
const START = new Date('2026-08-26T10:00:00.000Z')

/** `init` solo lee `windowMs`; el resto de `Options` no interviene. */
const initOptions = (windowMs: number) => ({ windowMs }) as Options

function createStore(namespace: string, db: DiagnosticsDb, windowMs = ONE_MINUTE_MS) {
  const store = new SqliteRateLimitStore({ namespace, db })
  store.init(initOptions(windowMs))
  return store
}

function countRows(db: DiagnosticsDb): number {
  const [row] = db.all<{ total: number }>(sql`SELECT COUNT(*) AS total FROM rate_limit_counters`)
  return row.total
}

describe('SqliteRateLimitStore', () => {
  let db: DiagnosticsDb

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(START)
    resetDb()
    db = getDb()
  })

  afterEach(() => {
    vi.useRealTimers()
    resetDb()
  })

  describe('increment', () => {
    it('cuenta la primera peticion como 1 y fija el final de la ventana', () => {
      const store = createStore('login', db)

      const result = store.increment('10.0.0.1')

      expect(result.totalHits).toBe(1)
      expect(result.resetTime).toEqual(new Date(START.getTime() + ONE_MINUTE_MS))
    })

    it('acumula dentro de la misma ventana sin moverle el final', () => {
      const store = createStore('login', db)

      store.increment('10.0.0.1')
      vi.advanceTimersByTime(30_000)
      const result = store.increment('10.0.0.1')

      expect(result.totalHits).toBe(2)
      expect(result.resetTime).toEqual(new Date(START.getTime() + ONE_MINUTE_MS))
    })

    it('cuenta por separado a dos clientes distintos', () => {
      const store = createStore('login', db)

      store.increment('10.0.0.1')
      store.increment('10.0.0.1')

      expect(store.increment('10.0.0.2').totalHits).toBe(1)
    })

    it('reinicia el contador cuando la ventana ya vencio', () => {
      const store = createStore('login', db)

      store.increment('10.0.0.1')
      store.increment('10.0.0.1')
      vi.advanceTimersByTime(ONE_MINUTE_MS + 1)
      const result = store.increment('10.0.0.1')

      expect(result.totalHits).toBe(1)
      expect(result.resetTime).toEqual(new Date(START.getTime() + ONE_MINUTE_MS * 2 + 1))
    })
  })

  describe('aislamiento por namespace', () => {
    it('no comparte contador entre dos limitadores con la misma ventana y limite', () => {
      const cognitive = createStore('diagnosis:cognitive', db)
      const clearDtc = createStore('diagnosis:clear-dtc', db)

      cognitive.increment('10.0.0.1')
      cognitive.increment('10.0.0.1')
      cognitive.increment('10.0.0.1')

      expect(clearDtc.increment('10.0.0.1').totalHits).toBe(1)
    })

    it('resetAll limpia su namespace y deja intactos los demas', () => {
      const cognitive = createStore('diagnosis:cognitive', db)
      const clearDtc = createStore('diagnosis:clear-dtc', db)
      cognitive.increment('10.0.0.1')
      clearDtc.increment('10.0.0.1')

      cognitive.resetAll()

      expect(cognitive.increment('10.0.0.1').totalHits).toBe(1)
      expect(clearDtc.increment('10.0.0.1').totalHits).toBe(2)
    })
  })

  describe('decrement', () => {
    it('resta una peticion al contador vigente', () => {
      const store = createStore('login', db)
      store.increment('10.0.0.1')
      store.increment('10.0.0.1')

      store.decrement('10.0.0.1')

      expect(store.increment('10.0.0.1').totalHits).toBe(2)
    })

    it('no baja de cero', () => {
      const store = createStore('login', db)
      store.increment('10.0.0.1')

      store.decrement('10.0.0.1')
      store.decrement('10.0.0.1')
      store.decrement('10.0.0.1')

      expect(store.increment('10.0.0.1').totalHits).toBe(1)
    })

    it('no falla sobre una clave que no existe', () => {
      const store = createStore('login', db)

      expect(() => store.decrement('10.0.0.9')).not.toThrow()
    })
  })

  describe('resetKey', () => {
    it('borra el contador de un cliente sin tocar el de los demas', () => {
      const store = createStore('login', db)
      store.increment('10.0.0.1')
      store.increment('10.0.0.2')

      store.resetKey('10.0.0.1')

      expect(store.increment('10.0.0.1').totalHits).toBe(1)
      expect(store.increment('10.0.0.2').totalHits).toBe(2)
    })
  })

  describe('purga de ventanas caducadas', () => {
    it('elimina las filas vencidas de otros clientes al registrar una peticion', () => {
      const store = createStore('login', db)
      store.increment('10.0.0.1')
      store.increment('10.0.0.2')
      expect(countRows(db)).toBe(2)

      vi.advanceTimersByTime(ONE_MINUTE_MS + 1)
      store.increment('10.0.0.3')

      expect(countRows(db)).toBe(1)
    })

    it('no toca las ventanas todavia vigentes', () => {
      const store = createStore('login', db)
      store.increment('10.0.0.1')

      vi.advanceTimersByTime(30_000)
      store.increment('10.0.0.2')

      expect(countRows(db)).toBe(2)
    })
  })

  describe('persistencia', () => {
    it('un store nuevo sobre la misma base sigue viendo el contador', () => {
      createStore('login', db).increment('10.0.0.1')

      const recreado = createStore('login', db)

      expect(recreado.increment('10.0.0.1').totalHits).toBe(2)
    })
  })

  describe('contrato de express-rate-limit', () => {
    it('declara que sus claves NO son locales al proceso', () => {
      expect(createStore('login', db).localKeys).toBe(false)
    })

    it('prefija sus claves con el namespace para la deteccion de doble conteo', () => {
      expect(createStore('auth:login', db).prefix).toBe('auth:login:')
    })

    it('usa la ventana por defecto si nadie llama a init', () => {
      const store = new SqliteRateLimitStore({ namespace: 'login', db })

      const result = store.increment('10.0.0.1')

      expect(result.resetTime).toEqual(new Date(START.getTime() + 15 * ONE_MINUTE_MS))
    })
  })
})
