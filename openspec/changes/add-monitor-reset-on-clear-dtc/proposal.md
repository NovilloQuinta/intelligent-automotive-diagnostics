## Why

La semana que viene el sistema se conecta a un coche real. Hoy, cuando se borran DTCs (Mode 04), los monitores de emisiones siguen apareciendo como "Completado" — la ECU real los pondría todos a "Pendiente" y tardarían un drive cycle en volver a completarse. El emulador no simula ese comportamiento, y el sistema no tiene ningún mecanismo para reflejarlo.

Esto es un problema para la demo: si un mecánico borra averías y ve que los monitores no cambian, el sistema pierde credibilidad. Si la IA diagnostica sin saber que los monitores están pendientes, puede dar un diagnóstico incorrecto (ej. sugerir que un sistema está OK cuando en realidad no se ha comprobado aún).

El MVP es simple: al borrar DTCs, todos los monitores pasan a pendiente. Cada lectura posterior de un PID del grupo correspondiente va completando monitores progresivamente, simulando el drive cycle.

## What

- Tras `clearDtcCodes()` (Mode 04), todos los monitores de emisiones del vehículo activo pasan a estado "pendiente" (completed=false)
- A medida que se leen PIDs del motor (via `getLiveData`, `readPid`, diagnosis), los monitores van volviendo a completarse de forma determinista y predecible
- El estado de los monitores se mantiene por sesión de diagnosis (no persiste en BD)
- El contador de DTCs (byte A, bits 0-6) baja a 0 tras el borrado
- El testigo MIL se apaga (byte A, bit 7 = 0) — consistente con Mode 04 real

## Impact

- **domain/value-objects/vehicleStatus.ts**: posible nuevo método `resetMonitors()` o constructor desde un estado base
- **infrastructure/services/diagnosisService.ts**: estado temporal por scenarioId que modifica el VehicleStatus devuelto
- **infrastructure/elm327/elm327Adapter.ts**: sin cambios — la lógica de reset va en la capa de servicio
- **infrastructure/simulation/simulator.ts**: el simulador ya usa `VehicleStatus.clean()` — coherencia
- **tests**: unitarios para el ciclo reset→pendiente→drive cycle→completado
- **UI**: sin cambios — el VehicleStatusPanel ya diferencia completado/pendiente con ✅ verde y ⚠️ amarillo
