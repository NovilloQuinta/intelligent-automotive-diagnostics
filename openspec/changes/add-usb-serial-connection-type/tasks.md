## 0. Preparacion

- [ ] 0.1 Crear `feat/usb-serial-connection-type` desde `develop`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [ ] 0.3 Instalar `serialport` en `apps/core-api`: `pnpm add serialport` (verificar que compila sin errores)
- [ ] 0.4 Cargar contexto: `tcpTransport.ts`, `elm327Adapter.ts`, `composition.ts`, `configuration/index.ts`, `diagnosisService.ts`, `types.ts` (UI), `TopBar.tsx`, `VehicleAutoDetectWizard.tsx`, `api.ts` (UI)
- [ ] 0.5 `@orchestrator` — confirmar plan de tareas y agentes (writer backend + ui frontend)

## 1. Interfaz Elm327Transport

- [ ] 1.1 RED: test — `Elm327TcpClient` satisface la interfaz `Elm327Transport` (structural typing: connect, sendCommand, close)
- [ ] 1.2 GREEN: crear `elm327Transport.ts` con la interfaz `Elm327Transport` y exportarla
- [ ] 1.3 Modificar `tcpTransport.ts`: `Elm327TcpClient` extiende explícitamente `Elm327Transport` (opcional en TS estructural, pero documenta el contrato)
- [ ] 1.4 Modificar `elm327Adapter.ts`: constructor recibe `Elm327Transport` en vez de crear `createElm327TcpClient` internamente. El adapter solo usa el transporte, no lo construye
- [ ] 1.5 Actualizar `composition.ts`: crear el transporte TCP (`createElm327TcpClient`) y pasárselo al adapter. Mismo comportamiento, distinta responsabilidad
- [ ] 1.6 REFACTOR: suite en verde — verificar que los tests de `tcpTransport` y `elm327Adapter` siguen pasando sin cambios

## 2. SerialTransport

- [ ] 2.1 RED: test — `createElm327SerialClient({ path: '/dev/ttyUSB0', baudRate: 38400 })` abre un puerto serie y devuelve `Elm327Transport`
- [ ] 2.2 RED: test — envío de `AT\r\n` responde `OK` (mock de `serialport` que emite `data` con `OK\r\r>`)
- [ ] 2.3 RED: test — comando `01 0C` responde `41 0C 0C 80\r\r>` (mock)
- [ ] 2.4 RED: test — dos comandos en rápida sucesión se serializan (cola FIFO): el segundo no se escribe hasta que el primero recibe `>`
- [ ] 2.5 RED: test — timeout de comando (3s sin `>`) rechaza con `Elm327ConnectionError`
- [ ] 2.6 RED: test — `close()` destruye el puerto y rechaza comandos pendientes
- [ ] 2.7 RED: test — reconexión automática tras `close` del puerto con backoff exponencial
- [ ] 2.8 GREEN: implementar `serialTransport.ts` con `createElm327SerialClient`, cola FIFO + mutex + reconexión, prompt `>` como delimitador
- [ ] 2.9 GREEN: `SerialConfig` con `path: string`, `baudRate: number`, `timeout?: number`, `maxRetries?: number`, `backoffMs?: number`
- [ ] 2.10 REFACTOR: con la suite en verde — verificar que no hay lógica de parseo duplicada con `tcpTransport.ts` (cada una tiene su propio bucle, pero el patrón es el mismo)

## 3. Backend: config y composicion

- [ ] 3.1 Extender `configSchema` en `configuration/index.ts`: `OBD_MODE` acepta `'serial'`; añadir `SERIAL_PORT_PATH` (default `/dev/ttyUSB0`) y `SERIAL_BAUD_RATE` (default `38400`)
- [ ] 3.2 RED: test — `loadConfig()` con `OBD_MODE=serial` y `SERIAL_PORT_PATH=/dev/ttyAMA0` valida correctamente
- [ ] 3.3 GREEN: implementar validación Zod
- [ ] 3.4 Modificar `composition.ts`: rama `OBD_MODE=serial` crea `createElm327SerialClient(config)` → `Elm327TcpRepository(transport)` → `DiagnosisService`
- [ ] 3.5 Modificar `TCP_DIRECT_SCENARIO` en `diagnosisService.ts`: añadir `connectionType: 'wifi'`
- [ ] 3.6 Crear `SERIAL_DIRECT_SCENARIO`: `id: 'serial'`, `name: 'ELM327 USB Connection'`, `connectionType: 'usb'`, `vehicleType: 'unknown'`
- [ ] 3.7 Modificar `createDockerScenarios`: cada descriptor docker lleva `connectionType: 'wifi'`

## 4. Backend: connectionType en la API

- [ ] 4.1 Añadir `connectionType: 'wifi' | 'usb' | 'bluetooth'` a `ScenarioDescriptor` en `diagnosisService.ts`
- [ ] 4.2 RED: test — `GET /api/scenarios` en modo serial devuelve `connectionType: 'usb'`
- [ ] 4.3 RED: test — `GET /api/scenarios` en modo tcp devuelve `connectionType: 'wifi'`
- [ ] 4.4 RED: test — `GET /api/scenarios` en modo docker devuelve `connectionType: 'wifi'` para los tres escenarios
- [ ] 4.5 GREEN: implementar `connectionType` en los descriptores
- [ ] 4.6 Actualizar swagger.ts: añadir `connectionType` al schema `Scenario`
- [ ] 4.7 REFACTOR: suite en verde

## 5. UI: tipo de conexion en el Scenario

- [ ] 5.1 Añadir `connectionType: 'wifi' | 'usb' | 'bluetooth'` al tipo `Scenario` en `apps/ui/src/components/dashboard/types.ts`
- [ ] 5.2 RED: test — `TopBar` muestra icono WiFi cuando `scenario.connectionType === 'wifi'`
- [ ] 5.3 RED: test — `TopBar` muestra icono USB cuando `scenario.connectionType === 'usb'`
- [ ] 5.4 RED: test — `TopBar` muestra icono Bluetooth cuando `scenario.connectionType === 'bluetooth'`
- [ ] 5.5 GREEN: implementar `ConnectionTypeIcon` en `TopBar.tsx` (al lado de `ConnectionStatus`)
- [ ] 5.6 RED: test — `VehicleAutoDetectWizard` muestra `connectionType` en `ConnectionButton`
- [ ] 5.7 GREEN: `ConnectionButton` muestra tipo de conexión debajo del nombre
- [ ] 5.8 REFACTOR: extraer `ConnectionTypeIcon` a componente compartido si se usa en dos sitios

## 6. UI: end-to-end

- [ ] 6.1 RED: test — `DashboardPage` con escenario `usb` muestra icono USB en TopBar y wizard
- [ ] 6.2 GREEN: integración
- [ ] 6.3 REFACTOR: suite en verde

## 7. Verificacion manual

- [ ] 7.1 Modo docker: levantar `docker compose up`, verificar que `GET /api/scenarios` devuelve `connectionType: 'wifi'` para los tres escenarios
- [ ] 7.2 Modo tcp: `OBD_MODE=tcp`, verificar `connectionType: 'wifi'` en el escenario sintético
- [ ] 7.3 Modo serial (si hay dispositivo físico): `OBD_MODE=serial SERIAL_PORT_PATH=/dev/ttyUSB0`, verificar `connectionType: 'usb'` y que `GET /api/live-data` devuelve datos reales
- [ ] 7.4 UI: comprobar que el icono de conexión aparece en TopBar y wizard para cada modo
- [ ] 7.5 Anotar resultados en el reporte — material para la memoria del TFM

## 8. Cierre

- [ ] 8.1 `@security`: auditar que `serialport` no introduce vulnerabilidades (path injection en `SERIAL_PORT_PATH`, permisos)
- [ ] 8.2 `@reviewer` sobre el diff completo
- [ ] 8.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde en `apps/core-api` y `apps/ui`
- [ ] 8.4 `pnpm test:coverage` — verificar que Core >=100% y Features >=80% se mantienen
- [ ] 8.5 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 8.6 Actualizar `README.md` con instrucciones de conexión USB (grupo `dialout`, `SERIAL_PORT_PATH`)
- [ ] 8.7 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
