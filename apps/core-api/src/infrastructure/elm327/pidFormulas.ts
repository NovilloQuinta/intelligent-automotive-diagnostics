import { evaluatePid } from './pidParser.js'
import { bigEndian } from './hexUtils.js'

/** Entrada de fórmula para un PID/DID. */
interface PidFormulaEntry {
  readonly formula: string
  readonly dataBytes: number
}

/** Catálogo de fórmulas con consulta `get(mode, pid)` y aplicación `apply`. */
interface PidFormulaCatalog {
  /** Devuelve la entrada de fórmula para un PID, o undefined si no existe. */
  get(mode: string, pid: string): PidFormulaEntry | undefined
  /** Aplica la fórmula del PID a los bytes dados, o fallback big-endian si es desconocido. */
  apply(mode: string, pid: string, bytes: number[]): number
}

/** Fórmulas estándar Mode 01 (SAE J1979) — 16 PIDs globales con clave "01 XX". */
export const STANDARD_MODE_01_FORMULAS: Record<string, PidFormulaEntry> = {
  '01 04': { formula: 'A*100/255', dataBytes: 1 },
  '01 05': { formula: 'A-40', dataBytes: 1 },
  '01 06': { formula: 'A*100/128-100', dataBytes: 1 },
  '01 07': { formula: 'A*100/128-100', dataBytes: 1 },
  '01 0B': { formula: 'A', dataBytes: 1 },
  '01 0C': { formula: '(A*256+B)/4', dataBytes: 2 },
  '01 0D': { formula: 'A', dataBytes: 1 },
  '01 0E': { formula: 'A/2-64', dataBytes: 1 },
  '01 0F': { formula: 'A-40', dataBytes: 1 },
  '01 10': { formula: '(A*256+B)/100', dataBytes: 2 },
  '01 11': { formula: 'A*100/255', dataBytes: 1 },
  '01 2F': { formula: 'A*100/255', dataBytes: 1 },
  '01 31': { formula: 'A*256+B', dataBytes: 2 },
  '01 42': { formula: '(A*256+B)/1000', dataBytes: 2 },
  '01 46': { formula: 'A-40', dataBytes: 1 },
  '01 5C': { formula: 'A-40', dataBytes: 1 },
}

/** Fórmulas VAG Mode 22 (DIDs reales del escenario Audi A3 2.0 TDI, Ross-Tech). */
export const VAG_MODE_22_FORMULAS: Record<string, PidFormulaEntry> = {
  '1130': { formula: '(A*256+B)/4', dataBytes: 2 }, // Engine Speed
  '115C': { formula: 'A*256+B', dataBytes: 2 }, // Charge Air Pressure — Actual (mbar)
  '115E': { formula: 'A*256+B', dataBytes: 2 }, // Charge Air Pressure — Specified (mbar)
  F430: { formula: 'A', dataBytes: 1 }, // Coolant Temperature (VAG scaling 1:1)
  F432: { formula: 'A', dataBytes: 1 }, // Intake Air Temperature
  F477: { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Fuel Rail Pressure — Actual (bar)
  F47D: { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Fuel Rail Pressure — Specified (bar)
  '1035': { formula: 'A', dataBytes: 1 }, // EGR Duty Cycle — Actual (%)
  '1250': { formula: 'A*256+B', dataBytes: 2 }, // Engine Torque (Nm)
  '1132': { formula: '(A*256+B)*0.01', dataBytes: 2 }, // Injection Quantity (mg/stroke)
  '1184': { formula: 'A*256+B', dataBytes: 2 }, // Intake Air Mass (mg/stroke)
  '1410': { formula: '(A*256+B)*0.01', dataBytes: 2 }, // DPF Soot Mass (g)
  '140E': { formula: 'A*256+B', dataBytes: 2 }, // DPF Differential Pressure (mbar)
  F449: { formula: 'A', dataBytes: 1 }, // Accelerator Pedal Position (%)
  '1462': { formula: '(A*256+B)/100', dataBytes: 2 }, // Battery Voltage (V)
  F40D: { formula: 'A', dataBytes: 1 }, // Vehicle Speed (km/h)
}

/** Crea un catálogo de fórmulas PID que combina Mode 01 SAE + Mode 22 VAG. */
export function createPidFormulaCatalog(): PidFormulaCatalog {
  const map = new Map<string, PidFormulaEntry>()

  for (const [key, entry] of Object.entries(STANDARD_MODE_01_FORMULAS)) {
    map.set(key, entry)
  }
  for (const [did, entry] of Object.entries(VAG_MODE_22_FORMULAS)) {
    map.set(`22 ${did}`, entry)
  }

  return {
    get(mode: string, pid: string): PidFormulaEntry | undefined {
      return map.get(`${mode} ${pid.toUpperCase()}`)
    },

    apply(mode: string, pid: string, bytes: number[]): number {
      const entry = map.get(`${mode} ${pid.toUpperCase()}`)
      if (!entry || entry.formula === '') return bigEndian(bytes)
      return evaluatePid(entry.formula, bytes.slice(0, entry.dataBytes))
    },
  }
}
