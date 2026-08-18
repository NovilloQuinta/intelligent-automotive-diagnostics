import { describe, it, expect, vi } from 'vitest'
import { createConsoleTracer } from '@/infrastructure/elm327/traceConsole.js'

describe('createConsoleTracer', () => {
  it('should print the command, the raw reply and the elapsed time on one line', () => {
    const write = vi.fn()
    createConsoleTracer(
      'serie',
      write,
    )({
      cmd: '01 0C',
      raw: '41 0C 0C 80\r\r>',
      durationMs: 12,
    })

    expect(write).toHaveBeenCalledTimes(1)
    const line = write.mock.calls[0][0] as string
    expect(line).toContain('01 0C')
    expect(line).toContain('41 0C 0C 80')
    expect(line).toContain('12ms')
    expect(line).toContain('serie')
  })

  it('should collapse the raw reply into a single line so the trace stays readable', () => {
    const write = vi.fn()
    createConsoleTracer(
      'serie',
      write,
    )({
      cmd: '09 02',
      raw: '0: 49 02 01 57 50 30\r1: 5A 5A 5A 39 39 5A\r\r>',
      durationMs: 40,
    })

    const line = write.mock.calls[0][0] as string
    expect(line).not.toContain('\r')
    expect(line).not.toContain('\n')
    expect(line).toContain('49 02 01')
    expect(line).toContain('5A 5A 5A')
  })

  it('should mark failed exchanges so they stand out while watching', () => {
    const write = vi.fn()
    createConsoleTracer(
      'serie',
      write,
    )({
      cmd: '03',
      error: 'ELM327 timeout (3000ms) after command "03"',
      durationMs: 3000,
    })

    const line = write.mock.calls[0][0] as string
    expect(line).toContain('03')
    expect(line).toContain('timeout')
    expect(line).toMatch(/ERROR|✗/)
  })

  it('should drop the echoed command from the reply — it is noise, not data', () => {
    const write = vi.fn()
    createConsoleTracer(
      'serie',
      write,
    )({
      cmd: '01 0C',
      raw: '01 0C\r41 0C 0C 80\r\r>',
      durationMs: 9,
    })

    const line = write.mock.calls[0][0] as string
    // El comando aparece una sola vez: en el lado del envio, no repetido en la respuesta.
    expect(line.match(/01 0C/g)).toHaveLength(1)
  })

  it('escribe por consola cuando no se le inyecta destino', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    createConsoleTracer('audi')({ cmd: '0100', durationMs: 12, raw: '41 00 BE' })

    expect(log).toHaveBeenCalledOnce()
    expect(log.mock.calls[0]?.[0]).toContain('[obd:audi]')
    log.mockRestore()
  })
})
