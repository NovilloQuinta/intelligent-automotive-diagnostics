/**
 * Escenario sintetico para el ELM327 real conectado por USB-OTG al propio
 * Android, espejo de `SERIAL_DIRECT_SCENARIO` en
 * `apps/core-api/src/infrastructure/services/diagnosisTypes.ts` — mismo
 * concepto (un "vehiculo" que no viene del catalogo de escenarios del
 * emulador), pero resuelto en el cliente en vez del servidor porque el cable
 * esta en el telefono, no en el core-api.
 *
 * Seleccionar este id es la señal que usan `@/lib/api` y `useScenarios` para
 * desviar las lecturas OBD del HTTP al transporte USB nativo.
 */
import type { Scenario } from '@/components/dashboard/types'

export const NATIVE_USB_SCENARIO_ID = 'native-usb'

export const NATIVE_USB_SCENARIO: Scenario = {
  id: NATIVE_USB_SCENARIO_ID,
  name: 'Vehículo real (USB-OTG)',
  vehicleType: 'unknown',
  connectionType: 'usb',
  sensorValues: { rpm: 0, coolantTemp: 0, speed: 0, intakeTemp: 0 },
  dtcConfig: [],
  vehicleInfo: { make: 'unknown', model: 'unknown', year: 0, engineType: 'unknown', vin: '' },
}

/** True si `scenarioId` es el escenario sintetico del vehiculo real por USB-OTG. */
export function isNativeUsbScenario(scenarioId: string): boolean {
  return scenarioId === NATIVE_USB_SCENARIO_ID
}
