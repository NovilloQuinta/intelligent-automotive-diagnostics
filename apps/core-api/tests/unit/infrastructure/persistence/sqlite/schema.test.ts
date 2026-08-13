import { describe, it, expect } from 'vitest'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import type { SQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core'
import * as schema from '@/infrastructure/persistence/sqlite/schema.js'

const columnNames = (table: SQLiteTable): string[] =>
  getTableConfig(table).columns.map((column) => column.name)

const columnByName = (table: SQLiteTable, name: string): SQLiteColumn | undefined =>
  getTableConfig(table).columns.find((column) => column.name === name)

describe('schema.pidDefinitions', () => {
  it('drops the vehicle_id and ecu_id columns', () => {
    const names = columnNames(schema.pidDefinitions)
    expect(names).not.toContain('vehicle_id')
    expect(names).not.toContain('ecu_id')
  })

  it('exposes a nullable system text column', () => {
    const system = columnByName(schema.pidDefinitions, 'system')
    expect(system).toBeDefined()
    expect(system!.notNull).toBe(false)
  })

  it('keeps the unique index on (mode, pid_code, manufacturer, model)', () => {
    const cfg = getTableConfig(schema.pidDefinitions)
    const uniqueIndex = cfg.indexes.find(
      (i) => i.config.name === 'pid_definitions_mode_pid_manufacturer_model_unique',
    )
    expect(uniqueIndex).toBeDefined()
    const names = uniqueIndex!.config.columns.map((c) => (c as SQLiteColumn).name)
    expect(names).toEqual(['mode', 'pid_code', 'manufacturer', 'model'])
  })
})

describe('schema.pidReadings', () => {
  it('exposes NOT NULL mode and pid_code columns', () => {
    expect(columnByName(schema.pidReadings, 'mode')?.notNull).toBe(true)
    expect(columnByName(schema.pidReadings, 'pid_code')?.notNull).toBe(true)
  })

  it('links session_id as an integer FK to diagnosis_sessions.id', () => {
    const sessionId = columnByName(schema.pidReadings, 'session_id')
    expect(sessionId).toBeDefined()
    expect(sessionId!.notNull).toBe(true)
    expect(sessionId!.dataType).toBe('number')

    const fk = getTableConfig(schema.pidReadings).foreignKeys.find(
      (f) => f.reference().foreignTable === schema.diagnosisSessions,
    )
    expect(fk).toBeDefined()
    const ref = fk!.reference()
    expect(ref.columns.map((c) => c.name)).toEqual(['session_id'])
    expect(ref.foreignColumns.map((c) => c.name)).toEqual(['id'])
  })

  it('keeps pid_def_id nullable and indexes session_id', () => {
    expect(columnByName(schema.pidReadings, 'pid_def_id')?.notNull).toBe(false)

    const cfg = getTableConfig(schema.pidReadings)
    const sessionIdx = cfg.indexes.find((i) =>
      i.config.columns.some((c) => (c as SQLiteColumn).name === 'session_id'),
    )
    expect(sessionIdx).toBeDefined()
  })
})

describe('schema.ecuDefinitions', () => {
  it('exposes the ecu_definitions columns with expected nullability', () => {
    const required = [
      'manufacturer',
      'model',
      'response_addr',
      'request_addr',
      'name',
      'type',
      'confidence',
      'source',
      'created_at',
    ]
    for (const name of required) {
      expect(columnByName(schema.ecuDefinitions, name)?.notNull).toBe(true)
    }
    expect(columnByName(schema.ecuDefinitions, 'system')?.notNull).toBe(false)
  })

  it('has a unique constraint on (manufacturer, model, response_addr)', () => {
    const cfg = getTableConfig(schema.ecuDefinitions)
    const unq = cfg.uniqueConstraints.find((u) => u.name === 'ecu_manufacturer_model_response_addr')
    expect(unq).toBeDefined()
    expect(unq!.columns.map((c) => c.name)).toEqual(['manufacturer', 'model', 'response_addr'])
  })
})
