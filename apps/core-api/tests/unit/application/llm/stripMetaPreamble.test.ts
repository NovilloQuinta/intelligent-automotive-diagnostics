import { describe, expect, it } from 'vitest'
import { stripMetaPreamble } from '@/application/llm/stripMetaPreamble.js'

describe('stripMetaPreamble', () => {
  it('borra el caso real visto en produccion: anuncio + "here is my analysis"', () => {
    const text =
      'I now have all the data needed to provide a comprehensive diagnostic report. Here is my analysis:\n\n🔧 Informe de Diagnóstico General del Vehículo'
    expect(stripMetaPreamble(text)).toBe(
      '🔧 Informe de Diagnóstico General del Vehículo',
    )
  })

  it('borra un "Let me..." inicial', () => {
    const text = 'Let me check the stored DTCs first. El vehículo presenta un fallo de encendido.'
    expect(stripMetaPreamble(text)).toBe('El vehículo presenta un fallo de encendido.')
  })

  it('borra un "I have reviewed..." inicial', () => {
    const text = "I've reviewed the data. El motor presenta un P0301."
    expect(stripMetaPreamble(text)).toBe('El motor presenta un P0301.')
  })

  it('no toca una narrativa que ya empieza directa en español', () => {
    const text = 'El vehículo presenta un fallo de encendido en el cilindro 1.'
    expect(stripMetaPreamble(text)).toBe(text)
  })

  it('no toca una mencion de estas frases mas adelante en el texto, solo al inicio', () => {
    const text = 'El mecánico dijo "let me check that" durante la revisión.'
    expect(stripMetaPreamble(text)).toBe(text)
  })

  it('devuelve cadena vacia si el texto entero era solo preambulo', () => {
    expect(stripMetaPreamble('Here is my analysis:')).toBe('')
  })
})
