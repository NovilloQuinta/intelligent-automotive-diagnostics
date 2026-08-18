import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getDb, closeDb } from '@/infrastructure/persistence/sqlite/db.js'

describe('getDb', () => {
  const tempRoots: string[] = []

  afterEach(() => {
    closeDb()
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  /** Crea una raiz temporal vacia y devuelve una ruta .db bajo un subdirectorio inexistente. */
  function dbPathUnderMissingDir(): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'diagnostics-db-'))
    tempRoots.push(root)
    return path.join(root, 'data', 'diagnostics.db')
  }

  it('crea el directorio del fichero .db cuando no existe', () => {
    const dbPath = dbPathUnderMissingDir()
    expect(fs.existsSync(path.dirname(dbPath))).toBe(false)

    getDb(dbPath)

    expect(fs.existsSync(dbPath)).toBe(true)
  })

  it('no falla si el directorio ya existe', () => {
    const dbPath = dbPathUnderMissingDir()
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })

    expect(() => getDb(dbPath)).not.toThrow()
  })

  it('no intenta crear directorio para la BD en memoria', () => {
    expect(() => getDb()).not.toThrow()
  })
})
