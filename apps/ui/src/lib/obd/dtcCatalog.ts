/**
 * Subconjunto del catalogo SAE J2012 de descripciones de DTC.
 *
 * Contiene SOLO los codigos estandar P0xxx que un coche real puede reportar en
 * la demo. Los codigos manufacturer-specific (P1xxx, P2xxx, P24xx, etc.) viven
 * en la BD (tabla `dtc_definitions`) via `seedManufacturerCatalog`, no en codigo.
 *
 * Un codigo ausente del catalogo se entrega con {@link dtcDescribe description: ''}.
 * Nunca se deriva la descripcion de la familia del codigo ni se inventa:
 * ese hueco lo rellena el indice vectorial y el LLM en {@code add-knowledge-mcp-tools}.
 */
const DTC_DESCRIPTIONS: Record<string, string> = {
  // ===== P00xx — Fuel and Air Metering =====
  P0030: 'HO2S Heater Control Circuit (Bank 1, Sensor 1)',
  P0031: 'HO2S Heater Control Circuit Low (Bank 1, Sensor 1)',
  P0036: 'HO2S Heater Control Circuit (Bank 1, Sensor 2)',
  P0100: 'Mass or Volume Air Flow Circuit Malfunction',
  P0101: 'Mass or Volume Air Flow Circuit Range/Performance',
  P0102: 'Mass or Volume Air Flow Circuit Low Input',
  P0103: 'Mass or Volume Air Flow Circuit High Input',
  P0106: 'Manifold Absolute Pressure/Barometric Pressure Circuit Range/Performance',
  P0107: 'Manifold Absolute Pressure/Barometric Pressure Circuit Low Input',
  P0108: 'Manifold Absolute Pressure/Barometric Pressure Circuit High Input',
  P0110: 'Intake Air Temperature Circuit Malfunction',
  P0111: 'Intake Air Temperature Circuit Range/Performance',
  P0112: 'Intake Air Temperature Circuit Low Input',
  P0113: 'Intake Air Temperature Circuit High Input',
  P0115: 'Engine Coolant Temperature Circuit Malfunction',
  P0116: 'Engine Coolant Temperature Circuit Range/Performance',
  P0117: 'Engine Coolant Temperature Circuit Low Input',
  P0118: 'Engine Coolant Temperature Circuit High Input',
  P0120: 'Throttle/Pedal Position Sensor/Switch "A" Circuit Malfunction',
  P0121: 'Throttle/Pedal Position Sensor/Switch "A" Circuit Range/Performance',
  P0122: 'Throttle/Pedal Position Sensor/Switch "A" Circuit Low Input',
  P0123: 'Throttle/Pedal Position Sensor/Switch "A" Circuit High Input',
  P0130: 'O2 Sensor Circuit Malfunction (Bank 1, Sensor 1)',
  P0131: 'O2 Sensor Circuit Low Voltage (Bank 1, Sensor 1)',
  P0132: 'O2 Sensor Circuit High Voltage (Bank 1, Sensor 1)',
  P0133: 'O2 Sensor Circuit Slow Response (Bank 1, Sensor 1)',
  P0134: 'O2 Sensor Circuit No Activity Detected (Bank 1, Sensor 1)',
  P0135: 'O2 Sensor Heater Circuit Malfunction (Bank 1, Sensor 1)',
  P0136: 'O2 Sensor Circuit Malfunction (Bank 1, Sensor 2)',
  P0170: 'Fuel Trim Malfunction (Bank 1)',
  P0171: 'System Too Lean (Bank 1)',
  P0172: 'System Too Rich (Bank 1)',

  // ===== P02xx — Fuel and Air Metering (Injector Circuit) =====
  P0200: 'Injector Circuit Malfunction',
  P0201: 'Injector Circuit Malfunction — Cylinder 1',
  P0202: 'Injector Circuit Malfunction — Cylinder 2',
  P0203: 'Injector Circuit Malfunction — Cylinder 3',
  P0204: 'Injector Circuit Malfunction — Cylinder 4',
  P0234: 'Turbocharger/Supercharger Overboost Condition',
  P0299: 'Turbocharger/Supercharger Underboost Condition',

  // ===== P03xx — Ignition System or Misfire =====
  P0300: 'Random/Multiple Cylinder Misfire Detected',
  P0301: 'Cylinder 1 Misfire Detected',
  P0302: 'Cylinder 2 Misfire Detected',
  P0303: 'Cylinder 3 Misfire Detected',
  P0304: 'Cylinder 4 Misfire Detected',
  P0305: 'Cylinder 5 Misfire Detected',
  P0306: 'Cylinder 6 Misfire Detected',
  P0325: 'Knock Sensor 1 Circuit Malfunction (Bank 1)',
  P0335: 'Crankshaft Position Sensor "A" Circuit Malfunction',
  P0340: 'Camshaft Position Sensor "A" Circuit Malfunction (Bank 1)',

  // ===== P04xx — Auxiliary Emission Controls =====
  P0400: 'Exhaust Gas Recirculation Flow Malfunction',
  P0401: 'Exhaust Gas Recirculation Flow Insufficient Detected',
  P0402: 'Exhaust Gas Recirculation Flow Excessive Detected',
  P0403: 'Exhaust Gas Recirculation Circuit Malfunction',
  P0404: 'Exhaust Gas Recirculation Circuit Range/Performance',
  P0420: 'Catalyst System Efficiency Below Threshold (Bank 1)',
  P0430: 'Catalyst System Efficiency Below Threshold (Bank 2)',
  P0440: 'Evaporative Emission Control System Malfunction',
  P0442: 'Evaporative Emission Control System Leak Detected (Small Leak)',
  P0446: 'Evaporative Emission Control System Vent Control Circuit Malfunction',
  P0455: 'Evaporative Emission Control System Leak Detected (Gross Leak)',
  P0456: 'Evaporative Emission Control System Leak Detected (Very Small Leak)',
  P0460: 'Fuel Level Sensor Circuit Malfunction',

  // ===== P05xx — Vehicle Speed, Idle Control, and Auxiliary Inputs =====
  P0500: 'Vehicle Speed Sensor Malfunction',
  P0501: 'Vehicle Speed Sensor Range/Performance',
  P0505: 'Idle Control System Malfunction',
  P0506: 'Idle Control System RPM Lower Than Expected',
  P0507: 'Idle Control System RPM Higher Than Expected',
  P0511: 'Idle Air Control Circuit Malfunction',

  // ===== P06xx — Computer Output Circuit =====
  P0600: 'Serial Communication Link Malfunction',
  P0601: 'Internal Control Module Memory Check Sum Error',
  P0606: 'ECM/PCM Processor Malfunction',
  P0620: 'Generator Control Circuit Malfunction',
  P0621: 'Generator Lamp "L" Control Circuit Malfunction',
  P0630: 'VIN Not Programmed or Mismatch — ECM/PCM',
  P0638: 'Throttle Actuator Control Range/Performance (Bank 1)',
  P0641: 'Sensor Reference Voltage "A" Circuit/Open',
  P0642: 'Sensor Reference Voltage "A" Circuit Low',
  P0643: 'Sensor Reference Voltage "A" Circuit High',

  // ===== P07xx — Transmission =====
  P0700: 'Transmission Control System Malfunction',
  P0705: 'Transmission Range Sensor Circuit Malfunction (PRNDL Input)',
  P0715: 'Input/Turbine Speed Sensor Circuit Malfunction',
  P0717: 'Input/Turbine Speed Sensor Circuit No Signal',
  P0720: 'Output Speed Sensor Circuit Malfunction',
  P0722: 'Output Speed Sensor Circuit No Signal',
  P0730: 'Incorrect Gear Ratio',
  P0740: 'Torque Converter Clutch Circuit Malfunction',
}

/**
 * Resuelve la descripcion SAE J2012 de un codigo DTC.
 *
 * @param code - Codigo DTC en formato SAE J2012 (ej. "P0301").
 * @returns La descripcion del catalogo, o {@code ''} si el codigo no esta en el.
 *
 * @remarks
 * Nunca se deriva la descripcion de la familia del codigo ni se genera texto
 * plausible. Un codigo ausente del catalogo se entrega con {@code description: ''}
 * para que el indice vectorial o el LLM lo completen con su nivel de confianza
 * propio en {@code add-knowledge-mcp-tools}.
 */
export function dtcDescribe(code: string): string {
  const cleaned = code.trim().toUpperCase()
  return DTC_DESCRIPTIONS[cleaned] ?? ''
}
