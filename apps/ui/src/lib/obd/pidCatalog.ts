/**
 * Catalogo de PIDs Mode 01 (SAE J1979), portado como datos planos de
 * `apps/core-api/src/domain/catalogs/pidCatalog.ts` para el cliente nativo —
 * sin las clases `PidDefinition`/`Formula`/`PidCode` del backend, solo lo que
 * necesita el evaluador de {@link ./pidFormula}.
 */

export interface PidCatalogEntry {
  readonly pid: string
  readonly name: string
  readonly unit: string
  readonly formula: string
  readonly dataBytes: number
}

/** PIDs estandar Mode 01 (SAE J1979) — los mismos 16 que expone el backend. */
export const STANDARD_MODE_01_PIDS: readonly PidCatalogEntry[] = [
  { pid: '04', name: 'Calculated Engine Load', unit: '%', formula: 'A*100/255', dataBytes: 1 },
  { pid: '05', name: 'Engine Coolant Temperature', unit: '°C', formula: 'A-40', dataBytes: 1 },
  {
    pid: '06',
    name: 'Short Term Fuel Trim — Bank 1',
    unit: '%',
    formula: 'A*100/128-100',
    dataBytes: 1,
  },
  {
    pid: '07',
    name: 'Long Term Fuel Trim — Bank 1',
    unit: '%',
    formula: 'A*100/128-100',
    dataBytes: 1,
  },
  { pid: '0B', name: 'Intake Manifold Absolute Pressure', unit: 'kPa', formula: 'A', dataBytes: 1 },
  { pid: '0C', name: 'Engine RPM', unit: 'rpm', formula: '(A*256+B)/4', dataBytes: 2 },
  { pid: '0D', name: 'Vehicle Speed', unit: 'km/h', formula: 'A', dataBytes: 1 },
  { pid: '0E', name: 'Timing Advance', unit: '° before TDC', formula: 'A/2-64', dataBytes: 1 },
  { pid: '0F', name: 'Intake Air Temperature', unit: '°C', formula: 'A-40', dataBytes: 1 },
  { pid: '10', name: 'Mass Air Flow Rate', unit: 'g/s', formula: '(A*256+B)/100', dataBytes: 2 },
  { pid: '11', name: 'Throttle Position', unit: '%', formula: 'A*100/255', dataBytes: 1 },
  { pid: '2F', name: 'Fuel Tank Level Input', unit: '%', formula: 'A*100/255', dataBytes: 1 },
  {
    pid: '31',
    name: 'Distance Traveled Since Codes Cleared',
    unit: 'km',
    formula: 'A*256+B',
    dataBytes: 2,
  },
  {
    pid: '42',
    name: 'Control Module Voltage',
    unit: 'V',
    formula: '(A*256+B)/1000',
    dataBytes: 2,
  },
  { pid: '46', name: 'Ambient Air Temperature', unit: '°C', formula: 'A-40', dataBytes: 1 },
  { pid: '5C', name: 'Engine Oil Temperature', unit: '°C', formula: 'A-40', dataBytes: 1 },
]

/** Catalogo indexado por codigo de PID, para busqueda O(1). */
export const PID_CATALOG_BY_CODE: ReadonlyMap<string, PidCatalogEntry> = new Map(
  STANDARD_MODE_01_PIDS.map((entry) => [entry.pid, entry]),
)

/** Metadatos (nombre + unidad) de los PIDs Mode 01, indexados por codigo hex. */
export const PID_METADATA: ReadonlyMap<string, { readonly name: string; readonly unit: string }> =
  new Map(STANDARD_MODE_01_PIDS.map((p) => [p.pid, { name: p.name, unit: p.unit }]))
