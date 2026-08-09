## Why

Un equipo de taller no enseña una lista de averías: enseña **tres**, dice si el testigo del motor está encendido, y deja borrarlas. Nosotros hoy enseñamos una sola lista y no dejamos hacer nada con ella.

Los tres huecos son modos estándar de la norma SAE J1979, no extras de fabricante:

- **Mode 04 — borrar códigos.** `Elm327TcpRepository.clearDtcCodes()` **ya está implementado** en `infrastructure/elm327/elm327Adapter.ts` y envía `04`. Lo que no existe es endpoint ni botón: es capacidad muerta.
- **Mode 01 PID 01 — testigo del motor.** Devuelve si la luz del motor está encendida y cuántas averías hay almacenadas. Hoy la UI no puede decir algo tan básico como "el testigo está encendido".
- **Mode 07 y Mode 0A — averías pendientes y permanentes.** Una avería detectada una sola vez todavía no enciende el testigo (pendiente); una confirmada que solo la centralita puede retirar es permanente. Mostrar solo las almacenadas (Mode 03) da una foto incompleta: un fallo intermitente que aún no ha confirmado no aparece por ninguna parte.

Van en un solo cambio porque comparten los mismos ficheros — adaptador, controlador, rutas, panel de DTC y escenarios del emulador. Separarlas en tres ramas garantiza conflictos.

**Fuera de alcance por decisión explícita:** los monitores de emisiones y el veredicto de si el vehículo pasaría una inspección técnica. Se descarta en este cambio.

## What Changes

- **`POST /api/clear-dtc`**: expone `clearDtcCodes()`, que ya existe. Con confirmación explícita en la UI.
- **Botón de borrado con diálogo de advertencia** en el panel de DTC, que dice la verdad de lo que se pierde: las averías almacenadas **y su freeze frame** (la evidencia del fallo), y que las **permanentes no se borran**.
- **Nuevo método de lectura del estado del motor** (Mode 01 PID 01) en el adaptador, y `GET /api/vehicle-status`: testigo encendido/apagado y número de averías almacenadas.
- **Indicador del testigo del motor** en el dashboard, bien visible.
- **Lectura de Mode 07 y Mode 0A** reutilizando el parser existente (`parseDtcResponse` + `DtcCode.decodeFromBytes`), con descripción resuelta contra `domain/dtcCatalog.ts` igual que las almacenadas.
- **Tres secciones en el panel de DTC** — almacenadas, pendientes, permanentes — cada una con una explicación breve de qué significa. Una sección vacía se muestra vacía: que no haya pendientes es información, no motivo para ocultarla.
- **Emuladores**: los escenarios de `docker/elm327/scenarios/` no responden hoy a `01 01`, `07`, `0A` ni `04`. Se añaden.

## Capabilities

### New Capabilities
- `obd-standard-modes`: Modos estándar SAE J1979 que faltaban — borrado de códigos (Mode 04), estado del testigo del motor (Mode 01 PID 01) y lectura de averías pendientes (Mode 07) y permanentes (Mode 0A).

## Dependencies

**Depende de `fix-vehicle-identity-and-live-data`**, que debe estar mergeado en `develop` antes de empezar. Ambos reescriben `elm327Adapter.ts` a fondo y chocarían de frente. Además este cambio necesita `domain/dtcCatalog.ts`, que se introduce allí.

## Impact

- Modificado: `apps/core-api/src/infrastructure/elm327/elm327Adapter.ts` (+estado del motor, +Mode 07, +Mode 0A)
- Modificado: `apps/core-api/src/application/ports/ObdRepository.ts`
- Modificado: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- Modificado: `apps/core-api/src/infrastructure/http/controllers/DiagnosisController.ts`, `routes/diagnosis.routes.ts`, `swagger.ts`
- Modificado: `apps/ui/src/components/dashboard/DtcPanel.tsx` (tres secciones + botón de borrado)
- Nuevo: componente de testigo del motor en el dashboard
- Modificado: `apps/ui/src/lib/api.ts`
- Modificado: `docker/elm327/scenarios/audi_a3_tdi.py`, `kawasaki_z900.py`, `run_toyota.py`
- Tests unitarios en `apps/core-api/tests/unit/` y `apps/ui/tests/unit/`
