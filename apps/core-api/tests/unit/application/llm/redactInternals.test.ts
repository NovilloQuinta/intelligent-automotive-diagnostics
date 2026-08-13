import { describe, it, expect } from 'vitest'
import { redactInternals } from '@/application/llm/redactInternals.js'

/**
 * Tests directos del saneador.
 *
 * `cognitiveDiagnosisLeakage.test.ts` comprueba que el pipeline lo aplica;
 * esto comprueba como recompone el texto. La distincion importa: un saneador
 * que borra lo que debe pero deja " ." o ",," a la vista sigue delatando que
 * hay una tuberia por debajo, que es justo lo que se queria evitar.
 */

describe('redactInternals · recomposicion del texto', () => {
  it('no deja un espacio huérfano antes del punto al borrar la distancia final', () => {
    const result = redactInternals('Coherente con el caso previo (distancia 0.31).')

    expect(result).toBe('Coherente con el caso previo.')
  })

  it('no deja doble coma al borrar una distancia intercalada', () => {
    const result = redactInternals('El caso previo, distancia 0.31, encaja con el síntoma.')

    expect(result).not.toMatch(/,\s*,/)
    expect(result).toContain('encaja con el síntoma')
  })

  it('no deja un espacio huérfano antes de la coma al borrar un identificador', () => {
    const result = redactInternals(
      'El caso 3f2504e0-4f89-11d3-9a0c-0305e82c3301 , registrado ayer, coincide.',
    )

    expect(result).not.toMatch(/\s+,/)
  })

  it('deja intacto un texto de taller que no contiene nada interno', () => {
    const original =
      'La distancia de frenado se alarga: revisa pastillas (grosor mínimo 3 mm) y discos.'

    expect(redactInternals(original)).toBe(original)
  })
})
