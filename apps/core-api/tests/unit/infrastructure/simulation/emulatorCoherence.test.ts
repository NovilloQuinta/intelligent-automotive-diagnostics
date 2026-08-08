import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { evaluatePid } from '@/domain/services/pidFormula.js'

/**
 * Coherencia entre los DTC que declara cada escenario del emulador y los
 * valores de PID que responde.
 *
 * Este test existe porque la divergencia ya ocurrio una vez sin que nada la
 * detectara: la suite comprobaba que el parseo era correcto, nunca que lo
 * parseado tuviera sentido. El Audi declaraba tres averias y respondia con
 * los sensores de un motor sano, de modo que el diagnostico cognitivo no
 * tenia evidencia sobre la que razonar.
 *
 * No replica los valores esperados del fichero de escenario: extrae las
 * tramas crudas, las decodifica con las formulas SAE J1979 reales y comprueba
 * RANGOS derivados de cada averia. Un cambio de valor que siga siendo
 * coherente pasa; uno que contradiga su propio DTC falla.
 *
 * Se lee el fichero de escenario en vez de consultar al emulador por TCP para
 * que la comprobacion corra en CI sin depender de que Docker este levantado.
 */

const SCENARIOS_DIR = resolve(import.meta.dirname, '../../../../../../docker/elm327/scenarios')

/** Formulas SAE J1979 de los PID sobre los que se comprueba coherencia. */
const FORMULAS: Record<string, { formula: string; bytes: number }> = {
  '04': { formula: 'A*100/255', bytes: 1 }, // carga calculada (%)
  '05': { formula: 'A-40', bytes: 1 }, // temperatura refrigerante (degC)
  '0C': { formula: '(A*256+B)/4', bytes: 2 }, // regimen (rpm)
  '0D': { formula: 'A', bytes: 1 }, // velocidad (km/h)
  '10': { formula: '(A*256+B)/100', bytes: 2 }, // caudal de aire (g/s)
  '1F': { formula: 'A*256+B', bytes: 2 }, // tiempo de marcha (s)
  '2D': { formula: '(A-128)*100/128', bytes: 1 }, // error de EGR (%)
  '3C': { formula: '((A*256+B)/10)-40', bytes: 2 }, // temperatura de escape (degC)
}

/**
 * Extrae de un escenario los valores decodificados por modo y PID.
 * @param file - Nombre del fichero de escenario en `docker/elm327/scenarios`
 * @returns Mapa `"<modo> <pid>"` → valor fisico decodificado
 */
function decodeScenario(file: string): Map<string, number> {
  const source = readFileSync(resolve(SCENARIOS_DIR, file), 'utf8')
  const values = new Map<string, number>()

  // DT("41 04 4F") → modo de respuesta 41, PID 04, bytes de datos [0x4F]
  for (const match of source.matchAll(/DT\("([0-9A-F ]+)"\)/g)) {
    const bytes = match[1].split(/\s+/).map((b) => parseInt(b, 16))
    const [responseMode, pid, ...data] = bytes
    if (data.length === 0) continue

    // 41 → Mode 01, 42 → Mode 02
    const requestMode = (responseMode - 0x40).toString(16).padStart(2, '0').toUpperCase()
    const pidHex = pid.toString(16).padStart(2, '0').toUpperCase()
    const entry = FORMULAS[pidHex]
    if (!entry) continue

    values.set(`${requestMode} ${pidHex}`, evaluatePid(entry.formula, data.slice(0, entry.bytes)))
  }

  return values
}

/** Códigos de avería que declara el escenario en su respuesta al Mode 03. */
function declaredDtcs(file: string): string[] {
  const source = readFileSync(resolve(SCENARIOS_DIR, file), 'utf8')
  const match = source.match(/DT\("43 ([0-9A-F ]+)"\)/)
  if (!match) return []

  const bytes = match[1].split(/\s+/).map((b) => parseInt(b, 16))
  const codes: string[] = []
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const first = 'PCBU'[(bytes[i] & 0xc0) >> 6]
    const second = ((bytes[i] & 0x30) >> 4).toString()
    const rest = (
      (bytes[i] & 0x0f).toString(16) + bytes[i + 1].toString(16).padStart(2, '0')
    ).toUpperCase()
    codes.push(`${first}${second}${rest}`)
  }
  return codes
}

describe('coherencia de los escenarios del emulador', () => {
  describe('Audi A3 2.0 TDI — tres averias declaradas', () => {
    const file = 'audi_a3_tdi.py'

    it('declara P0301, P0401 y P2002', () => {
      expect(declaredDtcs(file)).toEqual(['P0301', 'P0401', 'P2002'])
    })

    it('P0301 queda respaldado por carga elevada y regimen por debajo del objetivo', () => {
      const v = decodeScenario(file)

      // Un 2.0 TDI sano ronda el 18 % al ralenti; la centralita compensa el
      // cilindro que no aporta par y la carga sube.
      expect(v.get('01 04')).toBeGreaterThan(25)
      // El regimen cae por debajo del objetivo de 800 rpm, sin llegar a calarse.
      expect(v.get('01 0C')).toBeGreaterThan(650)
      expect(v.get('01 0C')).toBeLessThan(800)
    })

    it('P0401 queda respaldado por error de EGR muy negativo y caudal de aire elevado', () => {
      const v = decodeScenario(file)

      // Recirculacion pedida y no obtenida: un error residual no justifica el DTC.
      expect(v.get('01 2D')).toBeLessThan(-40)
      // Contraintuitivo y deliberado: sin gases de escape desplazando la
      // admision, entra MAS aire fresco que en un motor sano (~8,5 g/s).
      expect(v.get('01 10')).toBeGreaterThan(10)
    })

    it('P2002 queda respaldado por temperatura de escape elevada', () => {
      const v = decodeScenario(file)

      // Un DOC sano al ralenti ronda los 220 degC; el filtro saturado
      // restringe el flujo y la temperatura sube.
      expect(v.get('01 3C')).toBeGreaterThan(280)
    })

    it('el freeze frame describe un instante bajo carga, no el ralenti actual', () => {
      const v = decodeScenario(file)

      expect(v.get('02 0C')).toBeGreaterThan(1500)
      expect(v.get('02 0D')).toBeGreaterThan(0)
      // Si el freeze frame coincide con la lectura actual no aporta nada, y con
      // el se cae el argumento de leerlo antes de borrar las averias.
      expect(v.get('02 0C')).not.toBe(v.get('01 0C'))
      expect(v.get('02 0D')).not.toBe(v.get('01 0D'))
    })

    it('el tiempo de marcha es compatible con la temperatura del refrigerante', () => {
      const v = decodeScenario(file)

      // Un diesel no alcanza temperatura de servicio en dos minutos.
      if ((v.get('01 05') ?? 0) >= 80) {
        expect(v.get('01 1F')).toBeGreaterThan(600)
      }
    })
  })

  describe('Kawasaki Z900 — grupo de control sano', () => {
    const file = 'kawasaki_z900.py'

    it('no declara ninguna averia', () => {
      expect(declaredDtcs(file)).toEqual([])
    })

    it('ningun valor queda fuera de rango', () => {
      const v = decodeScenario(file)

      // Si el vehiculo sano tambien lee raro, el contraste con el Audi no
      // informa de nada.
      expect(v.get('01 04')).toBeGreaterThan(5)
      expect(v.get('01 04')).toBeLessThan(30)
      expect(v.get('01 0C')).toBeGreaterThan(900)
      expect(v.get('01 0C')).toBeLessThan(1600)
      expect(v.get('01 05')).toBeGreaterThan(70)
      expect(v.get('01 05')).toBeLessThan(105)
    })
  })
})
