## Why

Una máquina de taller guarda todo lo que diagnostica. El mecánico vuelve sobre un coche que ya vio, compara la lectura de hoy con la de hace un mes, y demuestra al cliente qué había antes de la reparación y qué hay después. Hoy nuestra app **no guarda absolutamente nada**.

El informe consolidado ya existe (`SessionReportPanel` + `useSessionReport`, change `add-diagnosis-session-report-screen`), pero es una **composición en vivo**: cada vez que se abre vuelve a interrogar al vehículo. Cierras la pestaña y desaparece. Su propio `proposal.md` lo dejó explícito: *"el informe es una composición en vivo del `scenarioId` activo, no una entidad persistida (`DiagnosisSession`/`VehicleRepository` siguen sin conectarse)"*.

Y esa deuda sigue abierta:

- `diagnosisSessions` existe en `schema.ts` (id, vehicleId, scenarioId, startedAt, endedAt).
- `VehicleRepository.createSession()` y `endSession()` están implementados en `sqlite/vehicleRepository.ts:214-238`.
- **Ningún caso de uso los invoca.** El único sitio donde aparecen fuera de la persistencia es la declaración del puerto.
- Aunque se invocaran, la tabla no guarda **ningún resultado**: ni DTCs, ni severidad, ni freeze frame, ni la narrativa del LLM. No habría nada que listar.

Este cambio cierra el ciclo: guardar cada diagnóstico y poder consultarlo después.

## What Changes

- **Persistir el resultado del diagnóstico**: nueva columna `resultJson` (snapshot del informe) y `userId` en `diagnosis_sessions`, más migración Drizzle. El snapshot se guarda tal y como se vio en pantalla.
- **Conectar `createSession`/`endSession`**: `ProcessVehicleDiagnosisUseCase` abre la sesión al empezar y la cierra guardando el resultado. Deja de ser código muerto.
- **Nuevo endpoint `GET /api/diagnosis-history`**: listado paginado del usuario autenticado, con filtros por rango de fechas, vehículo y severidad.
- **Nuevo endpoint `GET /api/diagnosis-history/:id`**: recupera el snapshot guardado de una sesión concreta.
- **Nueva pantalla de historial** accesible con un botón desde el dashboard: tabla con fecha, vehículo, nº de averías y severidad; filtros de fecha (desde/hasta y atajos "hoy", "7 días", "30 días"); clic en una fila abre el informe **guardado**, no uno nuevo.
- **`SessionReportPanel` acepta un informe ya guardado** además de componerlo en vivo, para no duplicar la vista.

## Capabilities

### New Capabilities
- `diagnosis-history`: Persistencia del resultado de cada sesión de diagnóstico y consulta posterior mediante listado filtrable por fechas, con recuperación del informe tal como se generó.

### Modified Capabilities
- `diagnosis-session-report-screen`: el panel de informe pasa a admitir dos orígenes de datos — composición en vivo (comportamiento actual, sin cambios) o snapshot persistido.

## Dependencies

Depende de la autenticación ya existente (`auth-endpoints`, `auth-middleware`): el historial es **por usuario**, y sin `userId` no se puede aislar lo que ve cada uno.

No depende de `fix-vehicle-identity-and-live-data`, pero conviene mergearlo después: los snapshots guardados antes de ese arreglo contendrían la identidad de vehículo incorrecta.

## Impact

- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (+`resultJson`, +`userId`), nueva migración Drizzle
- Modificado: `apps/core-api/src/application/ports/VehicleRepository.ts` (+`findSessions`, +`findSessionById`, `endSession` con resultado)
- Modificado: `apps/core-api/src/infrastructure/persistence/sqlite/vehicleRepository.ts`
- Modificado: `apps/core-api/src/application/use-cases/ProcessVehicleDiagnosisUseCase.ts` (apertura y cierre de sesión)
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts`, `swagger.ts`
- Nuevo: `apps/ui/src/routes/history.tsx`, `apps/ui/src/components/history/` (tabla, filtros de fecha, hook)
- Modificado: `apps/ui/src/components/dashboard/TopBar.tsx` (botón "Historial")
- Modificado: `apps/ui/src/components/dashboard/SessionReportPanel.tsx` (admitir snapshot)
- Modificado: `apps/ui/src/lib/api.ts`
- Tests unitarios en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`; e2e en `apps/ui/tests/e2e/`
