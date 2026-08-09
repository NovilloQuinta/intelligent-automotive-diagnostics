## 0. Preparación

- [ ] 0.1 Crear `feat/diagnosis-sqlite-persistence` desde `develop`
- [ ] 0.2 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde (en `apps/core-api/`)
- [ ] 0.3 Cargar contexto: `proposal.md`, `design.md`, `mcpServer.ts`, `diagnosisService.ts`, `vehicleRepository.ts`, `VehicleRepository.ts` (puerto), `schema.ts`, `PidReading.ts`, `EcuInfo.ts`, `VehicleProfile.ts`, `DiagnosisSession.ts`, `DtcCode.ts`

## 1. Conversión VehicleInfo → VehicleProfile en diagnosisService.ts

- [ ] 1.1 **RED**: test — `toVehicleProfile` convierte `VehicleInfo` (make/model/year/engineType/Vin) a `VehicleProfile` con `id = 0`, mapeando correctamente todos los campos y usando `new Vin(vin.value)` para el value object
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 1.2 **GREEN**: implementar `private toVehicleProfile(info: VehicleInfo): VehicleProfile` en `DiagnosisService`
  - Archivo: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- [ ] 1.3 **REFACTOR**: con tests en verde — verificar que la función no tiene lógica condicional innecesaria y que el `id = 0` es explícito (porque el ID real lo asigna SQLite). Si es una función pura de 5 líneas, el refactor es confirmar que no necesita extracción.

## 2. Vehicle upsert al iniciar cognitiveDiagnosis

- [ ] 2.1 **RED**: test — cuando `vehicleRepo` está configurado, `cognitiveDiagnosis()` llama a `vehicleRepo.upsertVehicle()` con los datos del vehículo obtenidos de `repository.getVehicleInfo()` ANTES de crear el servidor MCP
  - Verificar que `upsertVehicle` recibe `make = 'Audi'`, `model = 'A3'`, `year = 2018`, `engineType = 'unknown'` y VIN correcto
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 2.2 **RED**: test — cuando `vehicleRepo` es `undefined`, `cognitiveDiagnosis()` NO intenta llamar a `upsertVehicle` y el diagnóstico se completa con normalidad
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 2.3 **RED**: test — si `upsertVehicle` lanza error, el diagnóstico continúa normalmente (la excepción no se propaga) y el error se registra en el logger
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 2.4 **GREEN**: implementar el upsert del vehículo en `cognitiveDiagnosis()`:
  1. Obtener `vehicleInfo` de `repository.getVehicleInfo()` antes del bloque `if (!this.llmClient)`
  2. Si `this.vehicleRepo` existe, convertir con `toVehicleProfile()` y llamar `upsertVehicle`
  3. Capturar el `vehicleId` resultante (o `undefined` si falla)
  4. Si falla, loggear warning y seguir sin `vehicleId`
  - Archivo: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- [ ] 2.5 **REFACTOR**: con tests en verde — extraer la lógica de "upsert seguro" a un método privado `safeUpsertVehicle(vehicleInfo)` que devuelva `number | undefined`. Verificar que la carga de `vehicleInfo` no se duplica (se reutiliza para upsert y para el useCase). Confirmar que `getMcpServer` recibe el `sessionContext` si existe.

## 3. Session create/end en cognitiveDiagnosis

- [ ] 3.1 **RED**: test — cuando hay `vehicleId` válido, `cognitiveDiagnosis()` crea una sesión via `vehicleRepo.createSession()` con `vehicleId` y `scenarioId` (si aplica)
  - Verificar que `createSession` recibe una `DiagnosisSession` con los campos correctos
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 3.2 **RED**: test — `endSession(id)` se llama en el bloque `finally`, incluso si `useCase.execute()` lanza error o se produce timeout
  - Verificar que `endSession` se llama con el ID devuelto por `createSession`
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 3.3 **RED**: test — si `createSession` lanza error, no se llama a `endSession` (no hay ID que cerrar) y el diagnóstico continúa sin `sessionContext`
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 3.4 **RED**: test — si `endSession` lanza error en el finally, la excepción original del diagnóstico se propaga sin ser enmascarada
  - Archivo: `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts`
- [ ] 3.5 **GREEN**: implementar create/end session en `cognitiveDiagnosis()`:
  1. Tras el upsert exitoso, llamar `createSession(new DiagnosisSession({ id: 0, vehicleId, scenarioId, startedAt: new Date().toISOString() }))`
  2. Guardar `sessionId` resultante
  3. Construir `sessionContext = { sessionId, vehicleId, manufacturer, model }`
  4. Envolver el bloque `useCase.execute()` + `withTimeout` en try/finally
  5. En finally: `if (sessionId !== undefined) void this.vehicleRepo.endSession(sessionId).catch(...)`
  - Archivo: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- [ ] 3.6 **REFACTOR**: con tests en verde — extraer la creación de sesión a un método privado `safeCreateSession(vehicleId, scenarioId)` que devuelva `{ sessionId: number; vehicleId: number } | undefined`. Verificar que el try/finally no captura excepciones que deberían propagarse. Confirmar que `void` + `.catch()` evita `UnhandledPromiseRejection`.

## 4. SessionContext en createMcpServer y registerDiagnosticTools

- [ ] 4.1 **RED**: test — `createMcpServer` acepta un 5º parámetro `sessionContext` y `registerDiagnosticTools` lo recibe
  - Verificar que `registerDiagnosticTools` se llama con `sessionContext` cuando está presente
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 4.2 **RED**: test — cuando `sessionContext` es `undefined`, el servidor MCP se crea sin errores y todas las tools funcionan (comportamiento actual sin cambios)
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 4.3 **GREEN**: añadir `sessionContext?: SessionContext` como 5º parámetro de `createMcpServer`, propagarlo a `registerDiagnosticTools`, y de ahí a `handleReadPid`, `handleGetEcuInfo` y `handleGetDtcCodes`
  - Definir `export interface SessionContext { sessionId: number; vehicleId: number; manufacturer: string; model: string }` en `mcpServer.ts`
  - Modificar firmas: `createMcpServer`, `registerDiagnosticTools`, `handleReadPid`, `handleGetEcuInfo`, `handleGetDtcCodes`
  - El resto de handlers (`handleGetFreezeFrame`, `handleReadVin`, `handleGetVehicleInfo`, `handleGetAvailablePids`) NO reciben sessionContext — su firma no cambia
  - `manufacturer` y `model` se rellenan posteriormente en Task 12 desde `diagnosisService.ts`
  - Archivo: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`
- [ ] 4.4 **GREEN**: pasar `sessionContext` desde `DiagnosisService.cognitiveDiagnosis()` en la llamada a `createMcpServer`
  - Modificar `getMcpServer` para aceptar y propagar `sessionContext` con `manufacturer` y `model`
  - Archivo: `apps/core-api/src/infrastructure/services/diagnosisService.ts`
- [ ] 4.5 **REFACTOR**: con tests en verde — verificar que ningún handler que no escribe accede a `sessionContext`. Confirmar que la interfaz `SessionContext` está exportada (la usará `diagnosisService.ts`). Revisar que el pattern de "parámetro opcional al final" es consistente en todas las firmas modificadas.

## 5. PID reading persistence en handleReadPid

- [ ] 5.1 **RED**: test — cuando `sessionContext` está presente, `handleReadPid` persiste una lectura en `pid_readings` con `sessionId` (convertido a string), `rawHex` (obtenido de `readPidRaw`) y `parsedValue`
  - Mockear `vehicleRepo.insertPidReading` y verificar que se llama con un `PidReading` que tenga los campos correctos
  - Verificar que `sessionId` se pasa como `String(sessionContext.sessionId)`
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 5.2 **RED**: test — la tool devuelve el valor del PID al LLM sin esperar a que `insertPidReading` complete (la llamada es fire-and-forget con `void`)
  - Verificar que el resultado de `callTool('read_pid', ...)` no depende de que `insertPidReading` resuelva
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 5.3 **RED**: test — si `repo.readPidRaw()` falla (ELM327 no responde a segunda lectura), `insertPidReading` NO se llama y la tool devuelve el valor normalmente
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 5.4 **RED**: test — si `vehicleRepo.insertPidReading()` lanza error, la tool devuelve el valor del PID normalmente (el error se traga con `.catch()`)
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 5.5 **RED**: test — cuando `sessionContext` es `undefined`, `handleReadPid` NO intenta llamar a `insertPidReading` ni a `readPidRaw`
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 5.6 **GREEN**: implementar la persistencia en `handleReadPid`:
  1. Añadir 3er parámetro `sessionContext?: SessionContext`
  2. Tras leer el valor con `repo.readPid(modeStr, pidStr)`:
     ```
     if (vehicleRepo && sessionContext) {
       void repo.readPidRaw(modeStr, pidStr)
         .then((rawBytes) => {
           const rawHex = rawBytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')
           return vehicleRepo.insertPidReading(new PidReading({
             id: 0, sessionId: String(sessionContext.sessionId),
             rawHex, parsedValue: value,
           }))
         })
         .catch(() => { /* best-effort */ })
     }
     ```
  3. El `autoRegisterPid` existente se mantiene sin cambios
  - Archivo: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`
- [ ] 5.7 **REFACTOR**: con tests en verde — extraer la lógica de persistencia de lectura a una función helper `persistPidReading(vehicleRepo, sessionContext, modeStr, pidStr, value): void` si el bloque crece más de 10 líneas. Verificar que el patrón `void ... .catch()` es idéntico al de `autoRegisterPid` (consistencia). Confirmar que `readPidRaw` no bloquea el return de la tool.

## 6. ECU persistence en handleGetEcuInfo

- [ ] 6.1 **RED**: test — cuando `sessionContext` está presente, `handleGetEcuInfo` persiste cada ECU en la tabla `ecus` con el `vehicleId` de la sesión
  - Mockear `repo.getEcuInfo` para devolver 2 ECUs, verificar que `vehicleRepo.insertEcu` se llama 2 veces
  - Verificar que cada `insertEcu` recibe `vehicleId = sessionContext.vehicleId` (sobrescribiendo cualquier vehicleId que viniera del OBD)
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 6.2 **RED**: test — la tool devuelve la lista de ECUs al LLM sin esperar a que `insertEcu` complete (fire-and-forget)
  - Verificar que el resultado de `callTool('get_ecu_info', ...)` se resuelve antes que `insertEcu`
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 6.3 **RED**: test — si `repo.getEcuInfo` devuelve `[]`, no se llama a `insertEcu`
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 6.4 **RED**: test — si `vehicleRepo.insertEcu()` lanza error para una ECU, las demás ECUs se persiguen igual y la tool devuelve la lista completa
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 6.5 **RED**: test — cuando `sessionContext` es `undefined`, no se intenta ninguna escritura en `ecus`
  - Archivo: `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts`
- [ ] 6.6 **GREEN**: implementar la persistencia en `handleGetEcuInfo`:
  1. Añadir 3er parámetro `sessionContext?: SessionContext`
  2. Tras obtener `ecus` de `repo.getEcuInfo()`:
     ```
     if (vehicleRepo && sessionContext && ecus.length > 0) {
       for (const ecu of ecus) {
         void vehicleRepo.insertEcu(
           new EcuInfo({
             id: 0, vehicleId: sessionContext.vehicleId,
             name: ecu.name, requestAddr: ecu.requestAddr,
             responseAddr: ecu.responseAddr, type: ecu.type,
             protocol: ecu.protocol,
           })
         ).catch(() => { /* best-effort */ })
       }
     }
     ```
  3. El return `text(...)` existente se mantiene sin cambios
  - Archivo: `apps/core-api/src/infrastructure/mcp/mcpServer.ts`
- [ ] 6.7 **REFACTOR**: con tests en verde — extraer la lógica de persistencia de ECUs a una función helper `persistEcuList(vehicleRepo, sessionContext, ecus): void` si el bloque crece. Verificar que cada `insertEcu` es independiente (un fallo en una no cancela las demás). Confirmar que `new EcuInfo(...)` no lanza por vehicleId=0 (el constructor valida `vehicleId <= 0` → error — `sessionContext.vehicleId` es >0 porque viene de SQLite auto-increment, pero verificar en tests).

## 7. Verificación de integración y regresiones (bloque 1 — wire-up base)

- [ ] 7.1 Ejecutar `pnpm test` y confirmar que ningún test existente rompe — todos los cambios son aditivos (nuevas llamadas a métodos que ya existían en el mock)
  - Si un test existente falla porque el mock de `vehicleRepo` no esperaba la nueva llamada, añadir el mock necesario
- [ ] 7.2 Ejecutar `pnpm lint && pnpm format` y corregir todos los warnings/errores
- [ ] 7.3 Ejecutar `pnpm build` en `apps/core-api` y confirmar que compila sin errores
- [ ] 7.4 Verificar manualmente: arrancar el backend con `vehicleRepo` configurado, ejecutar un diagnóstico cognitivo contra el emulador, y comprobar que las tablas `vehicles`, `diagnosis_sessions`, `pid_readings` y `ecus` tienen filas nuevas
- [ ] 7.5 Verificar manualmente: arrancar sin `vehicleRepo` (o con SQLite roto) y confirmar que el diagnóstico cognitivo funciona exactamente igual que antes

---

## 8. Value object: Manufacturer normalization

- **Capa**: domain
- **Archivos**:
  - `apps/core-api/src/domain/value-objects/manufacturer.ts` (crear)
  - `apps/core-api/tests/unit/domain/value-objects/manufacturer.test.ts` (crear)
- **Dependencias**: Task 0 (preparación), Task 1 (toVehicleProfile para el punto de integración)
- **Descripción**: Crear el value object `Manufacturer` con función pura `normalizeManufacturer(raw: string): string` que aplica title-case, expande abreviaturas conocidas (`VW` → `Volkswagen`, `Gm` → `General Motors`, `Bmw` → `BMW`), elimina sufijos corporativos (`AG`, `GmbH`), y devuelve `'Unknown'` para cadenas vacías. El mapa de abreviaturas es un `Record<string, string>` exportable para testing. La función NO depende de ninguna capa superior.
- **Tests**:
  - `normalizeManufacturer('AUDI')` → `'Audi'`
  - `normalizeManufacturer('VW')` → `'Volkswagen'`
  - `normalizeManufacturer('AUDI AG')` → `'Audi'`
  - `normalizeManufacturer('')` → `'Unknown'`
  - `normalizeManufacturer('ssangyong')` → `'Ssangyong'` (sin entrada en el mapa, solo title-case)
- **Criterio de aceptación**: tests pasando + lint limpio + 100% coverage en el value object

### 8.1 RED
- [ ] 8.1.1 **RED**: test — `normalizeManufacturer` normaliza mayúsculas a title-case
- [ ] 8.1.2 **RED**: test — `normalizeManufacturer` expande abreviaturas del mapa
- [ ] 8.1.3 **RED**: test — `normalizeManufacturer` elimina sufijos corporativos
- [ ] 8.1.4 **RED**: test — `normalizeManufacturer` devuelve fallback para cadena vacía
- [ ] 8.1.5 **RED**: test — `normalizeManufacturer` aplica solo title-case para fabricantes desconocidos

### 8.2 GREEN
- [ ] 8.2.1 **GREEN**: implementar `normalizeManufacturer` en `manufacturer.ts` con el mapa de abreviaturas y la lógica de sufijos

### 8.3 REFACTOR
- [ ] 8.3.1 **REFACTOR**: con tests en verde — extraer `ABBREVIATION_MAP` como constante exportada, verificar que los sufijos se eliminan con regex `/\s+(AG|GmbH|Ltd|Inc|Corp|Limited)$/i`, asegurar que `trim()` se aplica antes de cualquier transformación

---

## 9. Schema: dtc_definitions table + migration

- **Capa**: infrastructure
- **Archivos**:
  - `apps/core-api/src/infrastructure/persistence/sqlite/schema.ts` (modificar — añadir tabla)
  - `apps/core-api/src/domain/entities/dtcDefinition.ts` (crear)
- **Dependencias**: Task 8 (manufacturer para el concepto de scope)
- **Descripción**: Añadir la tabla `dtcDefinitions` al schema de Drizzle con columnas `id` (PK autoincrement), `manufacturer` (TEXT NOT NULL), `model` (TEXT NOT NULL), `code` (TEXT NOT NULL), `description` (TEXT), `firstSeen` (TEXT NOT NULL DEFAULT datetime('now')), `lastSeen` (TEXT NOT NULL DEFAULT datetime('now')), y constraint `UNIQUE(manufacturer, model, code)`. Crear la entidad de dominio `DtcDefinition` con constructor validado (`code` no vacío, `manufacturer` no vacío, `model` no vacío). Generar migración con `pnpm drizzle-kit generate`.
- **Tests**:
  - `DtcDefinition` constructor valida campos obligatorios
  - `DtcDefinition` constructor acepta `description` opcional
  - El schema compila y drizzle-kit generate produce migración sin errores
- **Criterio de aceptación**: tests pasando + migración generada + `pnpm build` compila

### 9.1 RED
- [ ] 9.1.1 **RED**: test — `DtcDefinition` constructor lanza error si `code` está vacío
- [ ] 9.1.2 **RED**: test — `DtcDefinition` constructor lanza error si `manufacturer` está vacío
- [ ] 9.1.3 **RED**: test — `DtcDefinition` constructor lanza error si `model` está vacío
- [ ] 9.1.4 **RED**: test — `DtcDefinition` con `code='P0301'`, `manufacturer='Audi'`, `model='A3'` se construye correctamente con `id=0` y `description=undefined`

### 9.2 GREEN
- [ ] 9.2.1 **GREEN**: crear `DtcDefinition` entity en `domain/entities/dtcDefinition.ts`
- [ ] 9.2.2 **GREEN**: añadir `dtcDefinitions` table en `schema.ts` con la definición Drizzle
- [ ] 9.2.3 **GREEN**: ejecutar `pnpm drizzle-kit generate` y verificar que la migración se crea

### 9.3 REFACTOR
- [ ] 9.3.1 **REFACTOR**: con tests en verde — verificar que los nombres de columna siguen la convención snake_case del resto del schema. Confirmar que `UNIQUE(manufacturer, model, code)` se traduce correctamente en la migración SQL generada. Revisar que `DtcDefinition` no importa ninguna capa superior.

---

## 10. VehicleRepository: DTC methods + ECU dedup methods

- **Capa**: application (puerto) + infrastructure (implementación)
- **Archivos**:
  - `apps/core-api/src/application/ports/VehicleRepository.ts` (modificar — añadir métodos)
  - `apps/core-api/src/infrastructure/persistence/sqlite/vehicleRepository.ts` (modificar — implementar métodos)
  - `apps/core-api/tests/unit/infrastructure/persistence/sqlite/vehicleRepository.test.ts` (modificar — añadir tests)
- **Dependencias**: Task 9 (schema + DtcDefinition)
- **Descripción**: Añadir al puerto `VehicleRepository` tres métodos nuevos: `upsertDtcDefinition`, `findDtcDefinition`, `findEcuByAddress`, `updateEcuDiscoveredAt`. Implementarlos en `SqliteVehicleRepository`:
  - `upsertDtcDefinition`: INSERT OR UPDATE (si ya existe `(manufacturer, model, code)`, actualiza `lastSeen` y `description`; si no, inserta)
  - `findDtcDefinition`: SELECT por `(manufacturer, model, code)`
  - `findEcuByAddress`: SELECT por `(vehicleId, requestAddr, responseAddr)`
  - `updateEcuDiscoveredAt`: UPDATE `discovered_at = datetime('now')` WHERE id = ?
- **Tests**: unit tests con base de datos SQLite en memoria (`:memory:`) para cada método
- **Criterio de aceptación**: tests pasando + lint limpio

### 10.1 RED
- [ ] 10.1.1 **RED**: test — `upsertDtcDefinition` inserta un DTC nuevo y devuelve el `DtcDefinition` con `id` asignado
- [ ] 10.1.2 **RED**: test — `upsertDtcDefinition` con mismo `(manufacturer, model, code)` actualiza `lastSeen` y `description`, no crea duplicado
- [ ] 10.1.3 **RED**: test — `upsertDtcDefinition` con mismo código pero distinto manufacturer inserta nueva fila
- [ ] 10.1.4 **RED**: test — `findDtcDefinition` devuelve `null` si no existe el DTC para ese scope
- [ ] 10.1.5 **RED**: test — `findDtcDefinition` devuelve el `DtcDefinition` si existe
- [ ] 10.1.6 **RED**: test — `findEcuByAddress` devuelve `null` si no existe ECU con esa dirección en el vehículo
- [ ] 10.1.7 **RED**: test — `findEcuByAddress` devuelve la ECU si existe
- [ ] 10.1.8 **RED**: test — `updateEcuDiscoveredAt` actualiza `discoveredAt` sin modificar otros campos

### 10.2 GREEN
- [ ] 10.2.1 **GREEN**: implementar `upsertDtcDefinition` en `SqliteVehicleRepository` (INSERT ... ON CONFLICT DO UPDATE)
- [ ] 10.2.2 **GREEN**: implementar `findDtcDefinition` (SELECT + WHERE)
- [ ] 10.2.3 **GREEN**: implementar `findEcuByAddress` (SELECT + WHERE vehicleId, requestAddr, responseAddr)
- [ ] 10.2.4 **GREEN**: implementar `updateEcuDiscoveredAt` (UPDATE discovered_at)
- [ ] 10.2.5 **GREEN**: añadir firmas de los 4 métodos al puerto `VehicleRepository`

### 10.3 REFACTOR
- [ ] 10.3.1 **REFACTOR**: con tests en verde — verificar que `upsertDtcDefinition` usa la constraint UNIQUE de SQLite (`ON CONFLICT(manufacturer, model, code) DO UPDATE`). Extraer la conversión row → `DtcDefinition` a un helper privado si se repite. Confirmar que todos los métodos nuevos tienen TSDoc en el puerto.

---

## 11. MCP: handleGetDtcCodes DTC persistence + handleGetEcuInfo ECU dedup

- **Capa**: infrastructure
- **Archivos**:
  - `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (modificar — handleGetDtcCodes y handleGetEcuInfo)
  - `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts` (modificar — añadir tests)
- **Dependencias**: Task 4 (SessionContext con manufacturer/model), Task 10 (métodos del repositorio)
- **Descripción**: 
  - **handleGetDtcCodes**: tras obtener `dtcs` de `repo.readDtcCodes()`, persistir cada DTC en `dtc_definitions` vía `vehicleRepo.upsertDtcDefinition` con `manufacturer` y `model` de `sessionContext`. Fire-and-forget (`void ... .catch()`). El return `text(...)` existente no cambia.
  - **handleGetEcuInfo**: antes de cada `insertEcu`, llamar a `vehicleRepo.findEcuByAddress`. Si existe, llamar a `updateEcuDiscoveredAt`. Si no, insertar. Fire-and-forget. La lógica de dedup es secuencial dentro del IIFE async por ECU (una ECU no bloquea a las demás).
- **Tests**:
  - handleGetDtcCodes: DTC se persiste con manufacturer/model, sin sessionContext no escribe, fallo de escritura no afecta la respuesta
  - handleGetEcuInfo: ECU existente se actualiza (no duplica), ECU nueva se inserta, fallo en findEcuByAddress salta esa ECU, sin sessionContext no escribe
- **Criterio de aceptación**: tests pasando + lint limpio

### 11.1 RED — handleGetDtcCodes
- [ ] 11.1.1 **RED**: test — con `sessionContext`, `handleGetDtcCodes` persiste cada DTC vía `upsertDtcDefinition` con `manufacturer='Audi'`, `model='A3'`
- [ ] 11.1.2 **RED**: test — la tool devuelve los DTCs al LLM sin esperar a `upsertDtcDefinition` (fire-and-forget)
- [ ] 11.1.3 **RED**: test — sin `sessionContext`, no se llama a `upsertDtcDefinition`
- [ ] 11.1.4 **RED**: test — si `upsertDtcDefinition` lanza error, la tool devuelve los DTCs normalmente

### 11.2 RED — handleGetEcuInfo (ECU dedup)
- [ ] 11.2.1 **RED**: test — si `findEcuByAddress` encuentra una ECU existente, se llama a `updateEcuDiscoveredAt` y NO a `insertEcu`
- [ ] 11.2.2 **RED**: test — si `findEcuByAddress` no encuentra la ECU, se llama a `insertEcu`
- [ ] 11.2.3 **RED**: test — si `findEcuByAddress` lanza error, esa ECU se salta (ni update ni insert) y se procesa la siguiente
- [ ] 11.2.4 **RED**: test — la tool devuelve la lista de ECUs sin esperar a que las escrituras completen

### 11.3 GREEN
- [ ] 11.3.1 **GREEN**: modificar `handleGetDtcCodes` para aceptar `vehicleRepo` y `sessionContext` y persistir DTCs
- [ ] 11.3.2 **GREEN**: modificar `handleGetEcuInfo` para hacer dedup antes de insertar ECUs

### 11.4 REFACTOR
- [ ] 11.4.1 **REFACTOR**: con tests en verde — extraer `persistDtcDefinitions(vehicleRepo, sessionContext, dtcs): void` y `persistEcuWithDedup(vehicleRepo, sessionContext, ecus): void` como helpers. Verificar que el patrón `void (async () => { ... })().catch(...)` no deja Promises flotando. Confirmar que los handlers que no escriben (`handleGetFreezeFrame`, etc.) no han cambiado su firma.

---

## 12. SessionContext manufacturer/model enrichment + PID manufacturer/model dedup

- **Capa**: infrastructure
- **Archivos**:
  - `apps/core-api/src/infrastructure/services/diagnosisService.ts` (modificar — enriquecer sessionContext)
  - `apps/core-api/src/infrastructure/mcp/mcpServer.ts` (modificar — dedup en autoRegisterPid/handleReadPid)
  - `apps/core-api/tests/unit/infrastructure/services/diagnosisService.test.ts` (modificar)
  - `apps/core-api/tests/unit/infrastructure/mcp/mcpServer.test.ts` (modificar)
- **Dependencias**: Task 4 (SessionContext base), Task 8 (normalizeManufacturer), Task 10 (VehicleRepository con findPidDefinition)
- **Descripción**:
  - **diagnosisService.ts**: en `cognitiveDiagnosis()`, tras obtener `vehicleInfo`, normalizar `make` con `normalizeManufacturer` y pasarlo como `manufacturer` en `sessionContext` junto con `model`. El `SessionContext` ahora es `{ sessionId, vehicleId, manufacturer, model }`.
  - **mcpServer.ts — autoRegisterPid**: antes de insertar una definición de PID, hacer dedup por `manufacturer` + `model` + `mode` + `pidCode`. Usar `vehicleRepo.findPidDefinition` con JOIN a `vehicles` filtrando por `make` y `model`. Si existe, reutilizar la definición existente (usar su `id` para `pid_readings.pid_def_id`). Si no, insertar nueva. Si `manufacturer` o `model` están vacíos, fallback a `vehicleId`-based lookup (comportamiento previo).
- **Tests**:
  - diagnosisService: sessionContext incluye manufacturer normalizado y model
  - mcpServer: PID dedup por manufacturer/model reutiliza definición existente
  - mcpServer: PID nuevo para mismo manufacturer/model se inserta
  - mcpServer: PID mismo código distinto manufacturer se inserta como nuevo
  - mcpServer: fallback a vehicleId si manufacturer/model vacíos
- **Criterio de aceptación**: tests pasando + lint limpio

### 12.1 RED — SessionContext enrichment
- [ ] 12.1.1 **RED**: test — `cognitiveDiagnosis()` pasa `manufacturer` normalizado en `sessionContext` (ej. `'AUDI'` → `'Audi'`)
- [ ] 12.1.2 **RED**: test — `cognitiveDiagnosis()` pasa `model` tal cual en `sessionContext`
- [ ] 12.1.3 **RED**: test — cuando `vehicleInfo` no está disponible, `sessionContext` es `undefined`

### 12.2 RED — PID manufacturer/model dedup
- [ ] 12.2.1 **RED**: test — si ya existe un PID `22 F40D` para `('Audi', 'A3')`, `autoRegisterPid` no inserta nueva definición y devuelve la existente
- [ ] 12.2.2 **RED**: test — si NO existe PID para `('Audi', 'A3')`, `autoRegisterPid` inserta nueva definición
- [ ] 12.2.3 **RED**: test — si el mismo PID existe para `('Toyota', 'Corolla')` pero no para `('Audi', 'A3')`, se inserta nueva definición
- [ ] 12.2.4 **RED**: test — si `manufacturer` o `model` están vacíos, se usa `vehicleId` como scope (comportamiento previo, sin JOIN)
- [ ] 12.2.5 **RED**: test — si la query JOIN falla, se inserta la definición normalmente (sin dedup — degradación elegante)

### 12.3 GREEN
- [ ] 12.3.1 **GREEN**: en `diagnosisService.ts`: normalizar `make` con `normalizeManufacturer` al construir `sessionContext`
- [ ] 12.3.2 **GREEN**: en `mcpServer.ts`: modificar `autoRegisterPid` para hacer lookup por manufacturer/model antes de insertar
- [ ] 12.3.3 **GREEN**: en `mcpServer.ts`: si la definición existe, usar su `id` para `pid_readings.pid_def_id` en `handleReadPid`

### 12.4 REFACTOR
- [ ] 12.4.1 **REFACTOR**: con tests en verde — extraer la lógica de dedup a `findOrCreatePidDefinition(vehicleRepo, sessionContext, mode, pidCode, ...): Promise<PidDefinition>`. Verificar que el JOIN a `vehicles` es eficiente (usa índices existentes: `vehicles.make`, `vehicles.model`, `pid_definitions.mode`, `pid_definitions.pid_code`). Confirmar que `normalizeManufacturer` se aplica una sola vez en `diagnosisService`, no en cada handler.

---

## 13. Verificación de integración y regresiones (bloque 2 — scope expansion)

- [ ] 13.1 Ejecutar `pnpm test` y confirmar que todos los tests pasan (Task 0-7 + Task 8-12)
- [ ] 13.2 Ejecutar `pnpm lint && pnpm format` y corregir todos los warnings/errores
- [ ] 13.3 Ejecutar `pnpm build` en `apps/core-api` y confirmar que compila
- [ ] 13.4 Verificar manualmente: ejecutar dos diagnósticos con dos VINs distintos del mismo `make='Audi'` y `model='A3'` contra el emulador. Comprobar que `pid_definitions` no tiene duplicados para el mismo PID en ambos vehículos, y que `dtc_definitions` tiene una sola entrada por `(manufacturer, model, code)`.
- [ ] 13.5 Verificar manualmente: ejecutar un diagnóstico con `make='AUDI'` (mayúsculas) y otro con `make='Audi'`. Comprobar que `dtc_definitions.manufacturer` es `'Audi'` en ambos casos (normalización aplicada).
- [ ] 13.6 Verificar manualmente: ejecutar un diagnóstico sin `vehicleRepo` y confirmar que no hay errores.
- [ ] 13.7 Ejecutar `pnpm test:coverage` en `apps/core-api` y verificar que los thresholds se mantienen: Core (domain) 100%, Features >= 80%.
