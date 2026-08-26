import { and, eq, gt, lte, sql } from 'drizzle-orm'
import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit'
import * as schema from './schema.js'
import { getDb } from './db.js'
import type { DiagnosticsDb } from './db.js'

/** Ventana usada si `express-rate-limit` no llega a llamar a `init`. */
const DEFAULT_WINDOW_MS = 15 * 60 * 1000

/** Opciones de construccion de {@link SqliteRateLimitStore}. */
export interface SqliteRateLimitStoreOptions {
  /**
   * Identificador del limitador. Es la primera mitad de la clave primaria, y lo
   * que impide que agotar `/api/auth/login` agote tambien `/api/admin` para la
   * misma IP.
   */
  readonly namespace: string
  /**
   * Conexion a usar. Si se omite, se resuelve `getDb()` de forma perezosa en la
   * primera operacion, cuando el composition root ya la ha abierto sobre el
   * fichero real. Los tests inyectan la suya.
   */
  readonly db?: DiagnosticsDb
}

/**
 * Almacen de rate limiting respaldado por SQLite via Drizzle.
 *
 * Sustituye al `MemoryStore` por defecto de `express-rate-limit`, cuyo contador
 * vive en el heap: se perdia en cada reinicio —devolviendo a todo el mundo su
 * cuota entera— y no se compartia entre instancias.
 *
 * Todas las operaciones son sincronas porque `better-sqlite3` lo es, y el
 * interfaz `Store` acepta tanto valores como promesas. El `increment` va en una
 * transaccion para que dos peticiones concurrentes no lean el mismo contador.
 */
export class SqliteRateLimitStore implements Store {
  /** El contador vive en la base, no en el proceso: no es local a esta instancia. */
  readonly localKeys = false

  /**
   * Distingue este limitador en la deteccion de doble conteo de
   * `express-rate-limit`. Una peticion a `/api/auth/login` pasa por tres
   * limitadores (global, familia `/api/auth` y login); sin prefijos distintos,
   * la validacion la tomaria por un fallo de configuracion.
   */
  readonly prefix: string

  private readonly namespace: string
  private readonly injectedDb?: DiagnosticsDb
  private windowMs = DEFAULT_WINDOW_MS

  constructor(options: SqliteRateLimitStoreOptions) {
    this.namespace = options.namespace
    this.prefix = `${options.namespace}:`
    this.injectedDb = options.db
  }

  /** Recoge la ventana configurada en el middleware. */
  init(options: Options): void {
    this.windowMs = options.windowMs
  }

  /**
   * Suma una peticion al contador del cliente y devuelve el total vigente.
   *
   * Purga primero las ventanas vencidas —de todos los clientes, no solo de
   * este—, con lo que cualquier fila que sobreviva esta viva por definicion y
   * el caso "ventana caducada" no necesita rama propia: si no hay fila, el
   * contador empieza de cero.
   */
  increment(key: string): ClientRateLimitInfo {
    const now = Date.now()

    return this.db.transaction((tx) => {
      tx.delete(schema.rateLimitCounters).where(lte(schema.rateLimitCounters.resetAt, now)).run()

      const [current] = tx
        .select()
        .from(schema.rateLimitCounters)
        .where(this.rowKey(key))
        .limit(1)
        .all()

      if (!current) {
        const resetAt = now + this.windowMs
        tx.insert(schema.rateLimitCounters)
          .values({ namespace: this.namespace, clientKey: key, hits: 1, resetAt })
          .run()
        return { totalHits: 1, resetTime: new Date(resetAt) }
      }

      const hits = current.hits + 1
      tx.update(schema.rateLimitCounters).set({ hits }).where(this.rowKey(key)).run()
      return { totalHits: hits, resetTime: new Date(current.resetAt) }
    })
  }

  /**
   * Resta una peticion al contador vigente, con suelo en cero.
   *
   * Lo usa `skipSuccessfulRequests` / `skipFailedRequests` para devolver un hit
   * ya contado. Sobre una ventana vencida no hace nada: ese contador ya no cuenta.
   */
  decrement(key: string): void {
    this.db
      .update(schema.rateLimitCounters)
      .set({ hits: sql`max(${schema.rateLimitCounters.hits} - 1, 0)` })
      .where(and(this.rowKey(key), gt(schema.rateLimitCounters.resetAt, Date.now())))
      .run()
  }

  /** Borra el contador de un cliente en este limitador. */
  resetKey(key: string): void {
    this.db.delete(schema.rateLimitCounters).where(this.rowKey(key)).run()
  }

  /** Borra los contadores de todos los clientes en este limitador. */
  resetAll(): void {
    this.db
      .delete(schema.rateLimitCounters)
      .where(eq(schema.rateLimitCounters.namespace, this.namespace))
      .run()
  }

  /** Condicion sobre la clave primaria `(namespace, client_key)`. */
  private rowKey(key: string) {
    return and(
      eq(schema.rateLimitCounters.namespace, this.namespace),
      eq(schema.rateLimitCounters.clientKey, key),
    )
  }

  /** Resolucion perezosa: el composition root abre la conexion antes que el servidor. */
  private get db(): DiagnosticsDb {
    return this.injectedDb ?? getDb()
  }
}
