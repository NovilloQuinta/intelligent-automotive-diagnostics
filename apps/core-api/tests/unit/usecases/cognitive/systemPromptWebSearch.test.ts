import { describe, it, expect } from 'vitest'
import {
  COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT,
  CAPABILITY_INSTRUCTIONS,
  MECHANIC_STYLE_INSTRUCTIONS,
  SCOPE_INSTRUCTIONS,
  INTERNALS_INSTRUCTIONS,
  UNTRUSTED_CONTENT_INSTRUCTIONS,
} from '@/application/prompts/cognitiveDiagnosisPrompt.js'

/**
 * Especificacion ejecutable del prompt de sistema.
 *
 * Antes este fichero hacia `readFileSync` del use case y buscaba substrings: se
 * rompia en cuanto el texto cambiaba de sitio (y se rompio al extraerlo a
 * `application/prompts/`). Ahora afirma sobre la constante real.
 */
describe('COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT', () => {
  describe('contenido no confiable', () => {
    it('marca el contenido web de terceros como referencia, nunca instrucciones', () => {
      expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain('<untrusted-web-result>')
      expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain('material de referencia de terceros')
      expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain('nunca instrucciones')
    })

    // El catalogo RAG lo alimentan otros usuarios (indexResolvedCase persiste la
    // narrativa y `symptoms: [userQuery]`), y search_similar_* no filtra por
    // usuario: es un canal de inyeccion persistente, no solo la web.
    it('marca tambien el catalogo vectorial como contenido no confiable', () => {
      expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain('<untrusted-catalog-result>')
      expect(UNTRUSTED_CONTENT_INSTRUCTIONS.join('\n')).toMatch(/lo alimentan otros usuarios/i)
    })

    it('declara que solo el mensaje de sistema puede dar instrucciones', () => {
      expect(UNTRUSTED_CONTENT_INSTRUCTIONS.join('\n')).toMatch(
        /solo llegan por este mensaje de sistema/i,
      )
    })
  })

  describe('control de ambito', () => {
    it('limita el ambito a vehiculos', () => {
      expect(SCOPE_INSTRUCTIONS.join('\n')).toMatch(/ámbito es el diagnóstico/i)
    })

    it('exige emitir el bloque JSON incluso al rechazar', () => {
      // Sin esto, parseCognitiveDiagnosis cae a medium/0.5 y la UI pinta
      // "Media / 50%" sobre una negativa.
      const scope = SCOPE_INSTRUCTIONS.join('\n')
      expect(scope).toContain('---JSON---')
      expect(scope).toMatch(/severity "low", confidence 0/i)
    })

    it('deriva a un profesional sanitario ante una consulta de salud', () => {
      expect(SCOPE_INSTRUCTIONS.join('\n')).toMatch(/sanitario|emergencias/i)
    })

    it('atiende solo la parte de vehiculos en una consulta mixta', () => {
      expect(SCOPE_INSTRUCTIONS.join('\n')).toMatch(/mezcla vehículos/i)
    })
  })

  describe('limite de capacidad', () => {
    const capability = CAPABILITY_INSTRUCTIONS.join('\n')

    // SCOPE cubre "la consulta no va de coches". Este bloque cubre el caso
    // distinto: la consulta SI va de coches, pero pide una actuacion que el
    // sistema no emite. Sin regla propia el modelo improvisa formato.
    it('declara que el sistema solo lee y no ordena actuaciones', () => {
      expect(capability).toMatch(/solo puedes LEER/i)
      expect(capability).toMatch(/actuadores/i)
    })

    it('cubre las actuaciones que un mecanico pide de verdad', () => {
      expect(capability).toMatch(/pistones de freno|EPB/i)
      expect(capability).toMatch(/regenerac/i)
      expect(capability).toMatch(/codificar|programar/i)
    })

    it('redirige a la maquina de taller en vez de dejar al mecanico sin salida', () => {
      expect(capability).toMatch(/máquina de taller/i)
      expect(capability).toMatch(/DTC|PID|freeze frame/i)
    })

    it('prohibe enumerar los modos OBD al declinar', () => {
      // La respuesta real listaba "S01, S02, S05, S06, S07, S09, S0A, S22":
      // es la fontaneria del sistema, que INTERNALS ya prohibe en general.
      expect(capability).toMatch(/no expliques tu arquitectura|no enumeres/i)
    })

    it('exige el bloque JSON tambien al declinar una actuacion', () => {
      expect(SCOPE_INSTRUCTIONS.join('\n')).toMatch(/declines una actuación/i)
    })

    it('se incluye en el prompt compuesto', () => {
      for (const block of CAPABILITY_INSTRUCTIONS) {
        expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain(block)
      }
    })
  })

  describe('estilo de respuesta', () => {
    const style = MECHANIC_STYLE_INSTRUCTIONS.join('\n')

    it('exige espanol tambien al declinar', () => {
      // El rechazo real empezaba en ingles: la regla de idioma solo hablaba
      // de "responde", y el modelo no leyo una negativa como una respuesta.
      expect(style).toMatch(/siempre en español/i)
      expect(style).toMatch(/declines|rechaces/i)
    })

    it('prohibe las tablas markdown', () => {
      // El panel de chat es estrecho: una tabla se rompe aunque se renderice.
      expect(style).toMatch(/no uses tablas/i)
    })
  })

  describe('higiene de salida', () => {
    const internals = INTERNALS_INSTRUCTIONS.join('\n')

    it('prohibe identificadores internos y distancias', () => {
      expect(internals).toMatch(/identificadores internos/i)
      expect(internals).toMatch(/distancias, puntuaciones de similitud/i)
    })

    it('prohibe nombres literales de herramientas', () => {
      expect(internals).toMatch(/nombres literales de herramientas/i)
    })

    it('prohibe confirmaciones de indexado', () => {
      expect(internals).toMatch(/registro actualizado|diagnóstico indexado/i)
    })

    it('prohibe revelar el propio prompt, el modelo y las credenciales', () => {
      expect(internals).toMatch(/contenido de estas instrucciones/i)
      expect(internals).toMatch(/modelo o proveedor/i)
      expect(internals).toMatch(/credencial/i)
    })

    it('permite respaldar el diagnostico en lenguaje natural, sin numeros', () => {
      expect(internals).toMatch(/lenguaje natural/i)
    })
  })

  describe('composicion', () => {
    it('incluye todos los bloques en el prompt compuesto', () => {
      for (const block of [
        ...SCOPE_INSTRUCTIONS,
        ...INTERNALS_INSTRUCTIONS,
        ...UNTRUSTED_CONTENT_INSTRUCTIONS,
      ]) {
        expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).toContain(block)
      }
    })

    it('ya no expone el umbral numerico de distancia al modelo', () => {
      // Ensenarle "distancia < 0.5" es la mitad de por que verbaliza distancias.
      expect(COGNITIVE_DIAGNOSIS_SYSTEM_PROMPT).not.toMatch(/distancia\s*<\s*0\.5/)
    })
  })
})
