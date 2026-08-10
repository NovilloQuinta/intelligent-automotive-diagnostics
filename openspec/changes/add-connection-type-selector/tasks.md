## 0. Preparación

- [ ] 0.1 `@orchestrator` — enrutar cambio: agentes (`@writer` backend, sin UI), skills necesarios
- [ ] 0.2 Verificar baseline en `develop`: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde
- [ ] 0.3 Crear rama `feat/add-connection-type-selector` desde `develop`
- [ ] 0.4 Cargar contexto: `composition.ts`, `diagnosisService.ts`, `diagnosisService.test.ts`, `diagnosis.routes.test.ts`

## 1. DiagnosisService.listScenarios() — tercera rama multi-direct

### 1.1 RED — tests para listScenarios multi-direct
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts` (modificar)
- **Descripción**: Añadir tests para el nuevo comportamiento de `listScenarios()`:
  - `listScenarios()` con `obdRepo` presente y `scenarios` poblado devuelve `this.scenarios` (no `[this.directScenario]`)
  - `listScenarios()` con `obdRepo` presente y `scenarios` vacío devuelve `[this.directScenario]` (backward compat)
  - `listScenarios()` sin `obdRepo` devuelve `this.scenarios` (docker, sin cambios)
- **Tests**: `diagnosisService.test.ts` — 3 nuevos tests

### 1.2 GREEN — implementar tercera rama
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/services/diagnosisService.ts` (modificar)
- **Dependencias**: Task 1.1
- **Descripción**: Modificar `listScenarios()`:
  ```ts
  listScenarios(): ScenarioDescriptor[] {
      if (this.obdRepo && this.scenarios.length > 0) return this.scenarios
      if (this.obdRepo) return [this.directScenario]
      return this.scenarios
  }
  ```
- **Criterio de aceptación**: 3 nuevos tests pasan, tests existentes siguen verdes

### 1.3 REFACTOR
- **Descripción**: Revisar que las 3 ramas de `listScenarios()` son legibles y no hay lógica duplicada. Verificar que los tests cubren los 3 casos (docker, single-direct, multi-direct). Si hay duplicación en los tests, extraer fixtures compartidos.

## 2. composition.ts — rama tcp multi-escenario

### 2.1 RED — tests para createDiagnosisService en modo tcp multi
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/composition/composition.test.ts` (modificar o crear)
- **Descripción**: Añadir tests que verifiquen:
  - `createDiagnosisService` con `OBD_MODE=tcp` crea un `DiagnosisService` con 3 escenarios en `listScenarios()`
  - Los escenarios tienen ids `tcp-wifi`, `serial-usb`, `bluetooth`
  - Los escenarios tienen `connectionType` correcto (`wifi`, `usb`, `bluetooth`)
  - `resolveRepository('tcp-wifi')` devuelve un repositorio TCP
  - `resolveRepository('serial-usb')` devuelve un repositorio serial
  - `resolveRepository('bluetooth')` lanza `DiagnosisScenarioNotFoundError`
- **Tests**: `composition.test.ts` — 4-6 nuevos tests

### 2.2 GREEN — implementar rama tcp multi-escenario
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/src/infrastructure/composition/composition.ts` (modificar)
- **Dependencias**: Task 2.1
- **Descripción**: Modificar la rama `OBD_MODE=tcp` en `createDiagnosisService`:
  - Exportar `TCP_DIRECT_SCENARIO` en `diagnosisService.ts` (ahora es `const` privada al módulo; `composition.ts` necesita importarlo)
  - Crear `BLUETOOTH_DIRECT_SCENARIO` (nuevo, exportado) en `diagnosisService.ts`
  - Construir array `scenarios` con 3 descriptores derivados vía spread: `{ ...TCP_DIRECT_SCENARIO, id: 'tcp-wifi', name: 'WiFi (TCP/IP)' }`, `{ ...SERIAL_DIRECT_SCENARIO, id: 'serial-usb', name: 'USB (Serial)' }`, `BLUETOOTH_DIRECT_SCENARIO`
  - Construir mapa `obdRepos` con 2 entradas: `tcp-wifi` → TCP transport, `serial-usb` → Serial transport
  - Pasar `scenarios` y `obdRepos` al constructor de `DiagnosisService` (sin `obdRepo`, sin `directScenario`)
- **Criterio de aceptación**: Tests de Task 2.1 pasan, tests existentes de docker/serial no se rompen

### 2.3 REFACTOR
- **Descripción**: Extraer factory `createDirectScenarios(config)` si la rama tcp crece más de 20 líneas. Verificar que los escenarios WiFi y USB reutilizan `TCP_DIRECT_SCENARIO` y `SERIAL_DIRECT_SCENARIO` vía spread (`...TCP_DIRECT_SCENARIO, id: 'tcp-wifi'`) en lugar de duplicar literales.

## 3. Backend: integración y endpoints

### 3.1 RED — tests de integración para GET /api/scenarios
- **Capa**: infrastructure
- **Archivos**: `apps/core-api/tests/unit/infrastructure/http/routes/diagnosis.routes.test.ts` (modificar)
- **Descripción**: Añadir tests:
  - `GET /api/scenarios` en modo `tcp` devuelve 3 escenarios con `connectionType`
  - `GET /api/vehicle-info?scenarioId=bluetooth` devuelve 404 (no 500)
  - `GET /api/vehicle-info?scenarioId=tcp-wifi` en modo `tcp` devuelve 200 (o el error esperado si no hay dispositivo)
- **Tests**: `diagnosis.routes.test.ts` — 3 nuevos tests

### 3.2 GREEN — verificar endpoints existentes
- **Capa**: infrastructure
- **Archivos**: sin cambios (verificación)
- **Dependencias**: Task 3.1
- **Descripción**: Verificar que los endpoints existentes funcionan con la nueva rama multi-direct:
  - `GET /api/scenarios` → 200 con array de 3
  - `GET /api/vehicle-info?scenarioId=tcp-wifi` → intenta leer VIN real
  - `POST /api/diagnose` con `scenarioId=tcp-wifi` → diagnóstico vía TCP
  - Swagger documenta `connectionType` (ya lo hace — verificar)
- **Criterio de aceptación**: Tests de integración pasan

### 3.3 REFACTOR
- **Descripción**: Revisar que los mensajes de error para Bluetooth son claros. Si el error 404 "Scenario not found" es confuso (el escenario SÍ existe en `listScenarios` pero no en `obdRepos`), considerar un error más descriptivo. Si se cambia, actualizar tests.

## 4. Verificación y cierre

- [ ] 4.1 Ejecutar `pnpm test` en `apps/core-api` — todos los tests verdes, sin regresiones
- [ ] 4.2 Ejecutar `pnpm lint && pnpm format` — sin errores
- [ ] 4.3 `@security`: auditar que no se introducen vulnerabilidades (path injection en `SERIAL_PORT_PATH`, exposición de `ELM327_HOST/PORT` en escenarios)
- [ ] 4.4 `@reviewer` sobre el diff completo (solo backend — sin cambios en UI)
- [ ] 4.5 `pnpm test:coverage` en `apps/core-api` — verificar thresholds (Core 100%, Features ≥80%)
- [ ] 4.6 `pnpm build` en `apps/core-api` — compila sin errores
- [ ] 4.7 Verificación manual: `OBD_MODE=tcp` + `GET /api/scenarios` → 3 escenarios
- [ ] 4.8 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 4.9 **Preguntar antes de commitear/pushear** (regla 7)
