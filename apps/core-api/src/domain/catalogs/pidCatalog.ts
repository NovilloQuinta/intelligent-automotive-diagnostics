import type { PidDefinition } from '@/domain/entities/PidDefinition.js'
import { SYSTEM_ENGINE, SYSTEM_VEHICLE } from '@/domain/systemVocabulary.js'
import { Formula } from '@/domain/value-objects/Formula.js'
import { PidCode } from '@/domain/value-objects/PidCode.js'
import { MODE_CURRENT_DATA } from '@/domain/pids.js'

/** PIDs estándar Mode 01 (SAE J1979) — globales, para cualquier vehículo. */
export const STANDARD_MODE_01_PIDS: PidDefinition[] = [
  {
    id: 0,
    pidCode: new PidCode('01', '04'),
    name: 'Calculated Engine Load',
    system: SYSTEM_ENGINE,
    formula: new Formula('A*100/255'),
    unit: '%',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    description: 'Engine load calculated by the ECU',
  },
  {
    id: 0,
    pidCode: new PidCode('01', '05'),
    name: 'Engine Coolant Temperature',
    system: SYSTEM_ENGINE,
    formula: new Formula('A-40'),
    unit: '°C',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -40,
    maxValue: 215,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '06'),
    name: 'Short Term Fuel Trim — Bank 1',
    system: SYSTEM_ENGINE,
    formula: new Formula('A*100/128-100'),
    unit: '%',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -100,
    maxValue: 99.2,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '07'),
    name: 'Long Term Fuel Trim — Bank 1',
    system: SYSTEM_ENGINE,
    formula: new Formula('A*100/128-100'),
    unit: '%',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -100,
    maxValue: 99.2,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '0B'),
    name: 'Intake Manifold Absolute Pressure',
    system: SYSTEM_ENGINE,
    formula: new Formula('A'),
    unit: 'kPa',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 255,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '0C'),
    name: 'Engine RPM',
    system: SYSTEM_ENGINE,
    formula: new Formula('(A*256+B)/4'),
    unit: 'rpm',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 16383.75,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '0D'),
    name: 'Vehicle Speed',
    system: SYSTEM_VEHICLE,
    formula: new Formula('A'),
    unit: 'km/h',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 255,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '0E'),
    name: 'Timing Advance',
    system: SYSTEM_ENGINE,
    formula: new Formula('A/2-64'),
    unit: '° before TDC',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -64,
    maxValue: 63.5,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '0F'),
    name: 'Intake Air Temperature',
    system: SYSTEM_ENGINE,
    formula: new Formula('A-40'),
    unit: '°C',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -40,
    maxValue: 215,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '10'),
    name: 'Mass Air Flow Rate',
    system: SYSTEM_ENGINE,
    formula: new Formula('(A*256+B)/100'),
    unit: 'g/s',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 655.35,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '11'),
    name: 'Throttle Position',
    system: SYSTEM_ENGINE,
    formula: new Formula('A*100/255'),
    unit: '%',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 100,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '2F'),
    name: 'Fuel Tank Level Input',
    system: SYSTEM_VEHICLE,
    formula: new Formula('A*100/255'),
    unit: '%',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 100,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '31'),
    name: 'Distance Traveled Since Codes Cleared',
    system: SYSTEM_ENGINE,
    formula: new Formula('A*256+B'),
    unit: 'km',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 65535,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '42'),
    name: 'Control Module Voltage',
    system: SYSTEM_ENGINE,
    formula: new Formula('(A*256+B)/1000'),
    unit: 'V',
    dataBytes: 2,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: 0,
    maxValue: 65.535,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '46'),
    name: 'Ambient Air Temperature',
    system: SYSTEM_VEHICLE,
    formula: new Formula('A-40'),
    unit: '°C',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -40,
    maxValue: 215,
  },
  {
    id: 0,
    pidCode: new PidCode('01', '5C'),
    name: 'Engine Oil Temperature',
    system: SYSTEM_ENGINE,
    formula: new Formula('A-40'),
    unit: '°C',
    dataBytes: 1,
    pidType: 'formula',
    confidence: 1.0,
    source: 'manual',
    minValue: -40,
    maxValue: 210,
  },
]

/** Todos los PIDs de catálogo disponibles como seed data.
 * Solo PIDs universales SAE J1979 (Mode 01), aplicables a cualquier vehículo.
 * El VIN (Service 09 PID 02) se lee por {@link readVin} con `parseVinResponse`,
 * no por el catálogo de fórmulas, por lo que no necesita definición de seed.
 * Los PIDs Mode 22 (propietarios de fabricante) se cargan desde la BD en runtime
 * vía {@link seedManufacturerCatalog}, no desde código.
 */
export const ALL_SEED_PIDS: PidDefinition[] = [...STANDARD_MODE_01_PIDS]

/**
 * Metadatos (nombre + unidad) de los PIDs Mode 01 de {@link ALL_SEED_PIDS},
 * indexados por codigo hex (ej. "0C" → "Engine RPM"/"rpm").
 *
 * Vive aqui, junto a su fuente, porque nombre y unidad de un PID los fija la SAE J1979:
 * son dato de dominio, no de presentacion.
 *
 * Se deriva de `ALL_SEED_PIDS` (en ingles, SAE J1979) y no de `PID_OBSERVATION_CATALOG`
 * (español) porque este ultimo solo define 7 PIDs y la respuesta generica `readings` debe
 * cubrir los 16 Mode 01 para poder mostrar un gauge por PID.
 */
export const PID_METADATA: ReadonlyMap<string, { readonly name: string; readonly unit: string }> =
  new Map(
    ALL_SEED_PIDS.filter((p) => p.pidCode.mode === MODE_CURRENT_DATA).map((p) => [
      p.pidCode.pid,
      { name: p.name, unit: p.unit ?? '' },
    ]),
  )

/**
 * Formula con la que se interpreta un PID recien descubierto cuyo significado
 * todavia no esta en el catalogo (tipicamente un Mode 22 propietario).
 *
 * Es una asuncion normativa, no una decision del adaptador: a falta de
 * documentacion del fabricante, el supuesto razonable para un DID desconocido es
 * un entero sin signo big-endian de dos bytes, que es como SAE J1979 codifica
 * todos sus PIDs de dos bytes (`(A*256+B)/4` para el regimen, `(A*256+B)/100`
 * para el caudal masico...) sin el factor de escala, que si es especifico de
 * cada PID y no se puede adivinar.
 *
 * El valor resultante se registra con confianza baja precisamente porque la
 * escala se desconoce: la politica de confianza vive en la capa que registra el
 * hallazgo, no aqui.
 */
export const AUTO_DISCOVERY_PID_FORMULA = '(A*256+B)'

/** Bytes de datos que consume {@link AUTO_DISCOVERY_PID_FORMULA}. */
export const AUTO_DISCOVERY_PID_DATA_BYTES = 2
