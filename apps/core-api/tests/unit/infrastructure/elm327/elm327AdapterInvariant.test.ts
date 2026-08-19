import { describe, it, expect } from 'vitest'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import type { Elm327TransportPort } from '@/application/ports/Elm327TransportPort.js'
import { READ_ONLY_OBD_MODES } from '@/domain/obdServiceMode.js'

/**
 * Invariante estructural del adaptador: **nada que salga hacia el vehiculo puede
 * ser un servicio de control**, venga de donde venga.
 *
 * El guard vive en `fetchPidBytes`, no en el transporte, asi que un metodo nuevo
 * que llamase a `sendCommand` con entrada del llamante naceria sin proteccion y
 * nadie se enteraria hasta tenerlo delante del coche. Este test recorre la
 * superficie del prototipo por reflexion: un metodo nuevo entra solo en el
 * barrido, sin que haya que acordarse de anadirlo aqui.
 */

/** Modo de control transpuesto: el error mas probable, no el mas exotico. */
const HOSTILE_MODE = '2F'

/** Respuesta generica del adaptador: basta para que los parsers no revienten antes de enviar. */
const CANNED_RESPONSE = '41 00 00 00 00 00\r\r>'

/** Transporte falso que solo registra lo que se le pide enviar. */
function createRecordingTransport(): { transport: Elm327TransportPort; sent: string[] } {
  const sent: string[] = []
  const transport: Elm327TransportPort = {
    connect: async () => {},
    close: async () => {},
    sendCommand: async (cmd: string) => {
      sent.push(cmd)
      return CANNED_RESPONSE
    },
  }
  return { transport, sent }
}

/**
 * Ejercita por reflexion todos los metodos del prototipo, con argumentos
 * hostiles y luego legitimos. Los fallos se ignoran a proposito: lo que se
 * afirma no es que el metodo funcione, sino que no ha escrito nada peligroso.
 */
async function exerciseEveryMethod(repo: Elm327TcpRepository): Promise<void> {
  const methods = Object.getOwnPropertyNames(Elm327TcpRepository.prototype).filter(
    (name) => name !== 'constructor' && name !== 'close',
  )
  const argumentSets = [
    [HOSTILE_MODE, '01', 2],
    ['01', '0C', 2],
  ]
  for (const name of methods) {
    for (const args of argumentSets) {
      try {
        await (repo as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name](
          ...args,
        )
      } catch {
        // Un metodo que rechaza no ha llegado al bus: es exactamente lo que se busca.
      }
    }
  }
}

/**
 * Un comando es seguro si configura el propio ELM327 (`AT...`, nunca llega a la
 * ECU como peticion de servicio) o si su modo esta en la allowlist de lectura.
 */
function isSafeCommand(command: string): boolean {
  if (/^AT/i.test(command)) return true
  const [mode] = command.trim().split(/\s+/)
  return READ_ONLY_OBD_MODES.has(mode.toUpperCase())
}

describe('Elm327TcpRepository — invariante de solo lectura', () => {
  it('should never emit a control service from any method of its public surface', async () => {
    const { transport, sent } = createRecordingTransport()
    const repo = new Elm327TcpRepository(transport, undefined, undefined, { readOnly: true })

    await exerciseEveryMethod(repo)

    expect(sent.length).toBeGreaterThan(0) // el barrido ha ejercitado algo de verdad
    expect(sent.filter((cmd) => !isSafeCommand(cmd))).toEqual([])
  })

  it('should emit Mode 04 only from clearDtcCodes, never from the rest of the surface', async () => {
    const { transport, sent } = createRecordingTransport()
    // readOnly desactivado: es el caso permisivo, donde 04 sigue siendo legal.
    const repo = new Elm327TcpRepository(transport, undefined, undefined, { readOnly: false })

    await exerciseEveryMethod(repo)
    const withoutClear = sent.filter((cmd) => cmd !== '04')

    expect(sent).toContain('04') // clearDtcCodes sigue funcionando
    expect(withoutClear.filter((cmd) => !isSafeCommand(cmd))).toEqual([])
  })
})
