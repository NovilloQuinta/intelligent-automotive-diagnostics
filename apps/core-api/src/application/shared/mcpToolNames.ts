/** Nombre de la tool MCP que lee valores de PID OBD-II. */
export const READ_PID_TOOL = 'read_pid' as const

/**
 * Nombres de todas las tools MCP registradas.
 *
 * Fuente unica: `redactInternals.ts` (capa dura, borra estos nombres si se cuelan
 * en la narrativa) y `scripts/eval/invariants.ts` (INV-5, detecta la fuga en el
 * eval) lo consumen desde aqui para no mantener la lista duplicada en dos sitios.
 */
export const MCP_TOOL_NAMES = [
  'read_pid',
  'get_dtc_codes',
  'get_freeze_frame',
  'read_vin',
  'get_vehicle_info',
  'get_available_pids',
  'get_ecu_info',
  'search_similar_pids',
  'search_similar_dtcs',
  'search_similar_diagnoses',
  'search_similar_ecus',
  'index_pid',
  'index_dtc',
  'index_diagnosis',
  'index_ecu',
  'web_search',
] as const
