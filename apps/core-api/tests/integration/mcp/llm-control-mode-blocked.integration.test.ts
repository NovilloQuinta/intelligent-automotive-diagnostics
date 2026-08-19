import { describe, it, expect } from 'vitest'
import { createMcpServer } from '@/infrastructure/mcp/mcpServer.js'
import { Elm327TcpRepository } from '@/infrastructure/elm327/elm327Adapter.js'
import { ExecuteLlmToolCalling } from '@/application/use-cases/ExecuteLlmToolCalling.js'
import type { Elm327TransportPort } from '@/application/ports/Elm327TransportPort.js'
import type { LlmSingleResponse } from '@/application/dto/llm/LlmSingleResponse.js'
import type { ToolCallHandlerPort } from '@/application/ports/ToolCallHandlerPort.js'
import type { LoggerPort } from '@/application/ports/LoggerPort.js'

/**
 * Prueba end-to-end del camino que recorre de verdad una tool call: modelo →
 * {@link ExecuteLlmToolCalling} → `mcp.callTool` → adaptador → cable.
 *
 * Los tests unitarios afirman que el adaptador rechaza un modo de control. Este
 * afirma lo que de verdad importa antes de enchufar el coche: que **el rechazo
 * ocurre con el LLM pidiendolo por su cauce normal**, que el comando no llega al
 * transporte, y que lo que vuelve al modelo le permite corregir en vez de
 * reintentar. El unico eslabon simulado es el proveedor del LLM.
 */

/** Nivel de combustible al 49.8%: respuesta del emulador a `01 2F`. */
const FUEL_LEVEL_RESPONSE = '01 2F\r41 2F 7F \r\r>'

const silentLogger: LoggerPort = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
}

/** Transporte falso que registra cada comando que llegaria al cable. */
function createRecordingTransport(): { transport: Elm327TransportPort; sent: string[] } {
  const sent: string[] = []
  const transport: Elm327TransportPort = {
    connect: async () => {},
    close: async () => {},
    sendCommand: async (cmd: string) => {
      sent.push(cmd)
      return FUEL_LEVEL_RESPONSE
    },
  }
  return { transport, sent }
}

/**
 * Guion de un modelo que transpone `mode` y `pid` en su primer intento.
 *
 * Es el fallo realista: "2F" es nivel de combustible como PID y control de
 * actuadores como modo. Tras el rechazo reintenta bien y cierra con texto.
 */
function createTransposingLlm(): {
  send: () => Promise<LlmSingleResponse>
  turns: () => number
} {
  let turn = 0
  const script: LlmSingleResponse[] = [
    {
      text: null,
      toolCalls: [{ id: 'call_1', name: 'read_pid', args: { mode: '2F', pid: '01' } }],
      raw: {},
    },
    {
      text: null,
      toolCalls: [{ id: 'call_2', name: 'read_pid', args: { mode: '01', pid: '2F' } }],
      raw: {},
    },
    { text: 'El nivel de combustible es del 49.8%.', toolCalls: [], raw: {} },
  ]
  return {
    send: async () => script[turn++],
    turns: () => turn,
  }
}

describe('LLM pidiendo un servicio de control', () => {
  function setup() {
    const { transport, sent } = createRecordingTransport()
    const repo = new Elm327TcpRepository(transport)
    const mcp = createMcpServer(repo)
    const handler: ToolCallHandlerPort = async (name, args) => {
      const result = await mcp.callTool(name, args)
      return result.content[0].text
    }
    const llm = createTransposingLlm()
    const loop = new ExecuteLlmToolCalling(llm.send, silentLogger)
    return { sent, mcp, handler, loop, llm }
  }

  it('should never let the control mode reach the transport', async () => {
    const { sent, handler, loop, mcp } = setup()

    await loop.execute(
      { systemPrompt: '', userMessage: 'lee el nivel de combustible', tools: mcp.listTools() },
      handler,
    )

    // Lo unico que salio al cable fue la lectura legitima del segundo intento.
    expect(sent).toEqual(['01 2F'])
    expect(sent.some((cmd) => cmd.startsWith('2F'))).toBe(false)
  })

  it('should hand the model an actionable rejection instead of a retryable failure', async () => {
    const { handler, loop, mcp } = setup()

    const response = await loop.execute(
      { systemPrompt: '', userMessage: 'lee el nivel de combustible', tools: mcp.listTools() },
      handler,
    )

    const [blocked] = response.toolCalls
    expect(blocked.args).toEqual({ mode: '2F', pid: '01' })
    expect(blocked.result).toContain('client_error')
    expect(blocked.result).toContain('use mode "01"')
  })

  it('should let the model recover and complete the reading', async () => {
    const { handler, loop, mcp, llm } = setup()

    const response = await loop.execute(
      { systemPrompt: '', userMessage: 'lee el nivel de combustible', tools: mcp.listTools() },
      handler,
    )

    expect(response.toolCalls).toHaveLength(2)
    expect(response.toolCalls[1].args).toEqual({ mode: '01', pid: '2F' })
    expect(response.text).toContain('49.8')
    expect(llm.turns()).toBe(3)
  })
})
