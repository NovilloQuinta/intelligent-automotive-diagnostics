## Contexto

El schema y el repositorio SQLite están completos. Lo que falta es el cableado: decidir **quién** dispara cada escritura, **cuándo**, y **cómo fluye el `vehicleId`** entre los componentes del flujo de diagnóstico. Este documento recoge las decisiones de diseño que no son obvias al conectar la persistencia.

## Decisión 1: la sesión se crea en `DiagnosisService`, no en el UseCase

`DiagnosisService.cognitiveDiagnosis()` es el punto de entrada del diagnóstico cognitivo. Es infraestructura — tiene acceso a `vehicleRepo`, al repositorio OBD y al MCP server. Es el sitio natural para orquestar la sesión.

`ExecuteCognitiveDiagnosisUseCase` está en la capa de aplicación. No debe depender de infraestructura de persistencia (Clean Architecture). Inyectarle `VehicleRepository` violaría la regla de dependencias.

La sesión se crea **antes** de construir el MCP server para que el `sessionId` esté disponible en los handlers por closure. Se cierra en un bloque `finally` tras `useCase.execute()` para garantizar que incluso un timeout deje la sesión marcada como finalizada.

**Alternativa descartada**: crear la sesión en el UseCase. Requeriría inyectar `VehicleRepository` en la capa de aplicación, rompiendo Clean Architecture.

## Decisión 2: el vehículo se persiste al inicio del diagnóstico, no en los handlers

`cognitiveDiagnosis()` ya carga `vehicleContext` del repositorio OBD (línea 396 actual). Ese mismo dato se usa para hacer `upsertVehicle` antes de crear el MCP server.

**Por qué.** Necesitamos `vehicleId` para crear la sesión y para asociar ECUs. Si esperáramos a que el LLM llame a `get_vehicle_info` o `read_vin`, no tendríamos `vehicleId` durante la creación del MCP server ni durante las primeras tool calls. Y el orden de las tool calls lo decide el LLM — no hay garantía de que la primera sea sobre el vehículo.

Además, `upsertVehicle` es idempotente por VIN: si el LLM luego llama a `get_vehicle_info`, no se duplica el vehículo.

**Conversión**: `VehicleInfo` (value object del OBD) → `VehicleProfile` (entidad de dominio con `Vin` VO). La función de conversión vive en el archivo de `diagnosisService.ts` porque es infraestructura (mapeo entre capas).

## Decisión 3: `SessionContext` como contrato explícito en `createMcpServer`

Se añade un 5º parámetro opcional a `createMcpServer`:

```typescript
interface SessionContext {
  sessionId: number
  vehicleId: number
  manufacturer: string
  model: string
}

function createMcpServer(
  repo: ObdRepository,
  vehicleRepo?: VehicleRepository,
  knowledgeStack?: KnowledgeStack,
  webSearch?: WebSearchPort,
  sessionContext?: SessionContext,
): DiagnosticsMcpServer
```

`registerDiagnosticTools` recibe y distribuye este contexto a los handlers que escriben o necesitan scope: `handleReadPid`, `handleGetEcuInfo` y `handleGetDtcCodes`. Los handlers que no escriben ni necesitan scope (`handleGetFreezeFrame`, `handleReadVin`, `handleGetVehicleInfo`, `handleGetAvailablePids`) no lo reciben — su firma no cambia.

`manufacturer` y `model` se incluyen en el contexto para scope de definiciones compartidas (ver Decisión 8). Sin ellos, cada handler que inserta un PID o DTC tendría que hacer un JOIN a `vehicles` para obtener make/model, añadiendo una query extra por cada tool call. Pasarlos por closure evita ese overhead.

**Alternativa descartada**: hacer que los handlers lean el `sessionId` de una variable global o de un `AsyncLocalStorage`. Demasiada magia para un valor que se conoce en el momento de crear el servidor y no cambia durante la vida de la petición.

## Decisión 4: PID readings y ECU writes son fire-and-forget

Siguiendo el patrón de `autoRegisterPid()` (línea 131-152 de `mcpServer.ts`):

```typescript
void vehicleRepo.insertPidReading(...).catch(() => { /* best-effort */ })
```

**Por qué.** La respuesta al LLM no puede esperar a que SQLite confirme la escritura. Un `await` aquí añadiría milisegundos que se acumulan en diagnósticos con 15+ tool calls. Y un fallo de SQLite no es razón para devolver un error al LLM — el valor del PID ya se leyó del coche.

El patrón `void ... .catch()` es explícito: "dispara esto y olvídate, pero no dejes una Promise rechazada flotando".

## Decisión 5: `PidReading.sessionId` es string, `DiagnosisSession.id` es number

Hay una discrepancia de tipos entre el schema y las entidades:

- `diagnosisSessions.id` es `integer` → `DiagnosisSession.id` es `number`
- `pidReadings.sessionId` es `text` → `PidReading.sessionId` es `string`

Al guardar una lectura, se convierte: `sessionId: String(sessionContext.sessionId)`.

**No se modifica el schema.** Cambiar `sessionId` a `integer` con FK requeriría migración y podría romper otros usos. Cambiar `DiagnosisSession.id` a string requeriría migración del PK. Ambos cambios están fuera del alcance de este cableado.

**Riesgo aceptado**: `pid_readings.session_id` no tiene FK a `diagnosis_sessions.id`. Las consultas que crucen estas tablas necesitarán un `CAST`. Si esto se vuelve problemático, se resolverá en un cambio futuro dedicado al schema.

## Decisión 6: degradación total si `vehicleRepo` no está configurado

`vehicleRepo` es opcional en `DiagnosisServiceOptions`. Si no se inyecta, el diagnóstico funciona exactamente como hoy — sin persistencia. Esto es deliberado: la demo con un solo `docker-compose up` no debería requerir SQLite.

En `cognitiveDiagnosis()`, toda la lógica de sesión se envuelve en:

```typescript
if (this.vehicleRepo) {
  // upsert vehicle, create session, thread context
}
```

Y en los handlers MCP, cada escritura tiene `if (!vehicleRepo || !sessionContext) return;`.

## Decisión 7: `endSession` va en `finally`, no en el camino feliz

```typescript
try {
  return await withTimeout(diagnosis, this.cognitiveTimeoutMs, ...)
} catch (err) {
  if (err instanceof TimeoutError) throw new CognitiveDiagnosisTimeoutError()
  throw err
} finally {
  if (sessionId !== undefined) {
    void this.vehicleRepo.endSession(sessionId).catch(...)
  }
}
```

**Por qué.** Un timeout no es un fallo de la sesión — la sesión ocurrió, simplemente no terminó a tiempo. La fila en `diagnosis_sessions` debe quedar con `endedAt` poblado para no aparecer como "sesión activa eterna". Lo mismo si el LLM lanza un error inesperado.

`void` en el finally porque no queremos que un fallo de `endSession` enmascare la excepción original del diagnóstico.

## Decisión 8: `manufacturer` + `model` como scope de definiciones compartidas (PID y DTC)

**Problema.** La tabla `pid_definitions` enlaza cada definición a un `vehicleId` concreto. Si dos Audi A3 distintos (VIN distintos) pasan por diagnóstico, cada uno genera su propio conjunto de definiciones de PID aunque los PIDs sean idénticos. El usuario señaló correctamente que *"los PID y DTC no tienen sentido que se guarden con el vehículo — tiene sentido si fueran misma marca y modelo"*.

**Solución.** El scope de unicidad para definiciones pasa de `vehicleId` a `manufacturer` + `model`. Los campos `manufacturer` y `model` ya existen en la tabla `vehicles`; para evitar un JOIN en cada inserción de definición, se pasan en `SessionContext` (ver Decisión 3 ampliada).

Para PID definitions, el lookup de dedup antes de insertar es:

```
SELECT ... FROM pid_definitions pd
JOIN vehicles v ON pd.vehicle_id = v.id
WHERE v.make = ? AND v.model = ? AND pd.mode = ? AND pd.pid_code = ?
```

Si existe, se devuelve el existente sin insertar. Si no, se inserta con el `vehicleId` actual.

**Para DTC definitions** (nueva tabla, ver Decisión 9), el scope se aplica directamente en la tabla: la unicidad es `UNIQUE(manufacturer, model, code)` — no se necesita JOIN.

**Normalización de manufacturer.** Los valores de `make` que devuelve el OBD no siempre están normalizados: `"AUDI"` vs `"Audi"`, `"VW"` vs `"Volkswagen"`, `"TOYOTA"` vs `"Toyota"`. Una función ligera `normalizeManufacturer(raw: string): string` aplica title-case y mapea un conjunto pequeño de abreviaturas conocidas (`"VW"` → `"Volkswagen"`, `"GM"` → `"General Motors"`). Esto garantiza que dos diagnósticos del mismo fabricante produzcan el mismo scope key aunque el OBD devuelva mayúsculas o minúsculas distintas. La lista de mapeos es pequeña (~10 entradas) y se puede expandir sin migración.

**Alternativa descartada**: crear una tabla `manufacturers` separada con FK. Demasiado diseño relacional para un catálogo que crece orgánicamente con cada diagnóstico. El enfoque de strings normalizados en columnas `TEXT` es suficiente para este volumen de datos.

## Decisión 9: nueva tabla `dtc_definitions` con persistencia en `handleGetDtcCodes`

**Problema.** Los DTC codes (`P0301`, `P0420`, `U0100`, etc.) se leen del vehículo, se pasan al LLM para diagnóstico, y se descartan. No hay tabla que los persista. Sin esa persistencia, `add-diagnosis-history` no puede responder "¿cuándo fue la última vez que este modelo marcó P0301?".

**Qué NO son los DTC.** A diferencia de los PIDs, los DTC no tienen fórmula, ni unidad, ni dataBytes, ni min/max. Son códigos de fallo con una descripción opcional. El usuario lo confirmó: *"los DTC no llevan fórmula, no?"*. Correcto. La tabla es más simple que `pid_definitions`.

**Diseño de la tabla:**

```sql
CREATE TABLE dtc_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  code TEXT NOT NULL,
  description TEXT,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(manufacturer, model, code)
)
```

- `manufacturer` + `model`: scope compartido (misma Decisión 8). Un P0301 en un Audi A3 es el mismo código que en otro Audi A3.
- `code`: el código DTC normalizado (ej. `"P0301"`). `DtcCode.code` ya tiene este formato.
- `description`: texto opcional. Puede venir del OBD (algunos adaptadores ELM327 devuelven descripción junto al código) o poblarse más tarde desde `add-diagnosis-history`.
- `UNIQUE(manufacturer, model, code)`: garantiza que no se duplique el mismo código para el mismo modelo.

**Persistencia.** `handleGetDtcCodes` en `mcpServer.ts` actualmente solo devuelve los DTC al LLM. Con este cambio, además persiste cada DTC en `dtc_definitions` vía `upsertDtcDefinition`. El patrón es el mismo fire-and-forget que PIDs y ECUs:

```typescript
if (vehicleRepo && sessionContext && dtcs.length > 0) {
  for (const dtc of dtcs) {
    void vehicleRepo.upsertDtcDefinition({
      manufacturer: sessionContext.manufacturer,
      model: sessionContext.model,
      code: dtc.code,
      description: dtc.description,
    }).catch(() => { /* best-effort */ })
  }
}
```

**Métodos nuevos en `VehicleRepository`:**
- `upsertDtcDefinition(dtc: DtcDefinition): Promise<DtcDefinition>` — inserta o actualiza `lastSeen`
- `findDtcDefinition(manufacturer, model, code): Promise<DtcDefinition | null>`

**Alternativa descartada**: meter DTCs en `pid_definitions` con `pidType = 'dtc'`. El usuario preguntó *"en pid_readings también entran los DTC?"* — y la respuesta es no. Los DTCs son semánticamente distintos de los PIDs: no tienen fórmula, no se "leen" en tiempo real como un sensor, y su ciclo de vida (stored → pending → permanent → cleared) es diferente. Una tabla separada es más limpia y evita columnas nullable irrelevantes (`formula`, `unit`, `min_value`, `max_value` para un DTC siempre serían null).

## Decisión 10: deduplicación de ECUs por `(vehicleId, requestAddr, responseAddr)`

**Problema.** `insertEcu` actualmente inserta sin comprobar duplicados. Si el LLM invoca `get_ecu_info` dos veces durante la misma sesión (o en sesiones distintas del mismo vehículo), se crean filas duplicadas con los mismos `vehicleId`, `name`, `requestAddr` y `responseAddr`.

**Solución.** Antes de insertar, se busca si ya existe una ECU con la misma tupla `(vehicleId, name, requestAddr, responseAddr)`. Si existe, se actualiza `discoveredAt` a la fecha actual (la ECU se "re-descubrió"). Si no, se inserta.

**Método nuevo en `VehicleRepository`:**
```typescript
findEcuByAddress(vehicleId: number, requestAddr: string, responseAddr: string): Promise<EcuInfo | null>
```

La lógica de dedup vive en `handleGetEcuInfo` (capa de infraestructura, no en el repositorio) porque es una decisión de wiring, no de persistencia pura. El repositorio expone `findEcuByAddress` y `insertEcu`; el handler decide cuál llamar.

```typescript
for (const ecu of ecus) {
  void (async () => {
    const existing = await vehicleRepo.findEcuByAddress(
      sessionContext.vehicleId, ecu.requestAddr, ecu.responseAddr
    )
    if (existing) {
      await vehicleRepo.updateEcuDiscoveredAt(existing.id)
    } else {
      await vehicleRepo.insertEcu(new EcuInfo({
        id: 0, vehicleId: sessionContext.vehicleId,
        name: ecu.name, requestAddr: ecu.requestAddr,
        responseAddr: ecu.responseAddr, type: ecu.type,
        protocol: ecu.protocol,
      }))
    }
  })().catch(() => { /* best-effort */ })
}
```

**¿Por qué `name` en la tupla de unicidad?** `requestAddr` + `responseAddr` identifican una dirección CAN, pero un mismo address pair puede albergar ECUs distintas en vehículos diferentes. El `vehicleId` ya discrimina por vehículo, y `name` actúa como confirmación semántica: si el LLM ve "Engine" y "ECM" para la misma dirección, son la misma ECU con nombre ligeramente distinto. La unicidad real es `(vehicleId, requestAddr, responseAddr)`; `name` se actualiza si cambia.

**Método adicional**: `updateEcuDiscoveredAt(id: number): Promise<void>` para actualizar solo la columna `discoveredAt` sin tocar el resto de campos. Alternativa: reutilizar `insertEcu` con lógica UPSERT, pero eso requeriría cambiar la firma del método existente.

## Decisión 11: normalización ligera de manufacturer

**Problema.** El campo `make` que devuelve `ObdRepository.getVehicleInfo()` no está normalizado. Distintos adaptadores ELM327, emuladores y vehículos reales devuelven el fabricante con capitalización y formato inconsistentes: `"AUDI"`, `"Audi"`, `"audi"`, `"AUDI AG"`. Si no se normaliza, `"AUDI"` y `"Audi"` se tratan como fabricantes distintos, rompiendo el scope compartido de definiciones (Decisión 8).

**Solución.** Una función pura `normalizeManufacturer(raw: string): string` que:

1. Aplica trim y title-case (`"audi ag"` → `"Audi Ag"`)
2. Aplica un mapa de reemplazos conocido para abreviaturas y sufijos:
   - `"VW"` → `"Volkswagen"`
   - `"Gm"` → `"General Motors"`
   - `"Bmw"` → `"BMW"`
   - `"Mercedes-Benz"`, `"Mercedes Benz"` → `"Mercedes-Benz"`
   - `"Ag"`, `"AG"`, `"GmbH"` → se eliminan del final
3. Si el resultado está vacío, devuelve `"Unknown"`.

**Ubicación.** `apps/core-api/src/domain/value-objects/manufacturer.ts`. Es un value object porque encapsula una regla de normalización que aplica a toda la capa de dominio — no es infraestructura.

**Uso.** Se aplica en `DiagnosisService.toVehicleProfile()` al convertir `VehicleInfo.make` a `VehicleProfile.make`. El `SessionContext.manufacturer` que se pasa a los handlers ya está normalizado.

**Alternativa descartada**: normalizar en el repositorio SQLite (`SqliteVehicleRepository`). Rompe la separación de capas — el repositorio debe almacenar lo que recibe, no transformarlo. La normalización es una regla de dominio.

## Riesgos

- **Doble llamada a `repository.getVehicleInfo()`**: actualmente se llama dentro del IIFE del diagnóstico (línea 396). Con este cambio se llama antes (para upsert) y se reutiliza el resultado en el useCase. La llamada es una lectura OBD — duplicarla sería un retraso innecesario. Se extrae a una variable y se pasa en ambos sitios.
- **Vehículo con VIN `FALLBACK_VIN`**: todos los vehículos no identificables colisionan en la misma fila de `vehicles` (VIN único). `upsertVehicle` lo actualiza en vez de duplicarlo. Es aceptable: si el VIN no se lee, no tenemos forma de distinguir vehículos, y una sola fila "unknown" es mejor que N filas duplicadas.
- **`vehicleId=0`**: `VehicleProfile.id` permite 0 (no validado en el constructor como >0). Si el OBD devuelve datos con VIN no decodificable pero `upsertVehicle` crea la fila, el `id` será el auto-increment real, no 0. No hay riesgo de FK inválida.
- **Riesgo nuevo — DTC sin manufacturer/model**: si `manufacturer` o `model` están vacíos o son `"Unknown"`, la constraint `UNIQUE(manufacturer, model, code)` sigue funcionando pero agrupa todos los vehículos no identificados bajo `("Unknown", "Unknown")`. Esto es aceptable como fallback: es mejor tener una sola fila `("Unknown", "Unknown", "P0301")` que N filas huérfanas. El riesgo real es que dos coches de marcas distintas con VIN ilegible colisionen en la misma definición de DTC — pero sin VIN no hay forma de distinguirlos, así que el fallback es correcto.
- **Riesgo nuevo — `findEcuByAddress` sin índice**: la query de dedup de ECUs busca por `(vehicleId, name, requestAddr, responseAddr)`. Si un vehículo acumula cientos de ECUs (raro, típicamente <10), el scan secuencial es aceptable. Si se vuelve lento, se añade un índice compuesto en migración futura.
- **Riesgo nuevo — divergencia de `manufacturer` entre `VehicleProfile.make` y `SessionContext.manufacturer`**: `VehicleProfile.make` se persiste tal cual lo devolvió el OBD (sin normalizar, porque el repositorio no transforma). `SessionContext.manufacturer` se pasa normalizado. Esto significa que `vehicles.make` puede contener `"AUDI"` mientras `dtc_definitions.manufacturer` contiene `"Audi"`. Es intencionado: la tabla `vehicles` refleja el dato crudo; las tablas de definiciones usan el dato normalizado. Las queries que crucen vehículos con definiciones deben normalizar en el momento de la consulta — responsabilidad de `add-diagnosis-history`.
