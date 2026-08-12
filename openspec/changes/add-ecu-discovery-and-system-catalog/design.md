## Contexto

El flujo de datos actual, por capa:

```
UI EcuInfoPanel → GET /api/ecu-info → DiagnosisService.getEcuInfo → ObdRepository.getEcuInfo
                                                            ├─ Elm327TcpRepository → []  (stub)
                                                            └─ ObdSimulatorRepository → seedScenarios.ecus (hardcoded)
```

Y en el diagnóstico cognitivo: `mcpServer.handleGetEcuInfo` → `repo.getEcuInfo()` → si hay sesión, `persistEcus(vehicleRepo, vehicleId, ecus)` rellena la tabla `ecus`. La persistencia ya funciona; falta el **productor** de ECUs reales.

Estado del schema relevante (`schema.ts`):

| Tabla | Columnas problemáticas |
|---|---|
| `pid_definitions` | `vehicle_id` (FK, nullable), `ecu_id` (FK, nullable) — contradicen el modelo fabricante/modelo. Sin nivel `system`. Unique index `(mode, pid_code, manufacturer, model)` (migración 0004). |
| `pid_readings` | `pid_def_id` (nullable, sale null), `session_id` **text** (no FK), sin `mode`/`pid_code` |
| `ecus` | ya correcta (`vehicle_id`, `name`, `request_addr`, `response_addr`, `type`, `protocol`, `discovered_at`) |
| `vehicles` | `id, vin, make, model, year, engine_type, first_seen, last_seen` |

El transporte `Elm327Transport.sendCommand(cmd)` manda comandos raw al socket y resuelve con la respuesta cruda hasta el prompt `>`. El adapter hoy NO envía comandos AT (discrepancia ya documentada en `docs/tfm/03`). Para el descubrimiento de ECUs necesitamos **precisamente** enviar AT (`AT SH`, `AT H1`, …), cosa que `sendCommand` ya permite — solo hay que llamarlo con la secuencia correcta.

## Goals / Non-Goals

**Goals:**
- `getEcuInfo()` en `Elm327TcpRepository` descubre ECUs reales del bus CAN (no `[]`, no sintética).
- El catálogo de PIDs gana nivel `system` y pierde `vehicle_id`/`ecu_id` (puro fabricante/modelo).
- `pid_readings` es autodescriptivo (`mode`+`pid_code`) y ligado a sesión (FK entera).
- Descubrimiento **testeable sin hardware**: mock de transporte con tramas AT/headers simuladas.
- `ObdSimulatorRepository` (simulador interno de tests) sigue devolviendo `scenario.ecus` como fixture de test — no es fuente del catálogo de ECUs del vehículo real.

**Non-Goals:**
- No se implementa la UI de agrupación por `system` (queda para otro cambio; `system` solo se modela y seedea).
- No se soporta addressing 29-bit CAN (extended) ni ISO-TP multiframe en el scan — solo 11-bit ISO 15765-4.
- No se **seedeará** un catálogo de ECUs precargado (opciones A/C rechazadas por el usuario). El catálogo de ECUs (`ecu_definitions` + `ecus_index`) **sí entra en este cambio**, pero **nace vacío** y se llena por aprendizaje (opción B — Decisión 8). Solo `7E0/7E8 = ECM` vive en código; ninguna otra dirección se precarga ni se hardcodea.
- No se atribuye cada lectura a una ECU (`ecu_id` en `pid_readings`) — el modelo Autel liga lecturas a sesión+vehículo, no a ECU.
- No se resuelve la deuda `brace-expansion` ni la deuda vectorial (JSON metadata).

## Decisiones

### Decision 1: Descubrimiento por functional addressing CAN + fallback Mode 09 PID 0A

**Elegido**: El auto-scan usa functional addressing como mecanismo primario y Mode 09 PID 0A como fallback:

```
AT E0      # echo off
AT L0      # linefeeds off
AT H1      # headers on (cada respuesta prefijada con su CAN ID)
AT SP 6    # protocolo ISO 15765-4 (CAN 11/500)
AT SH 7DF  # functional addressing: broadcast a todas las ECUs
01 00      # Service 01 PID 00 — cada ECU que responde expone su header
```

Con `AT H1`, cada línea de respuesta empieza por el CAN ID de la ECU que responde (`7E8`, `7E9`, …). De ahí se derivan las ECUs: `response_addr = header`, `request_addr = header − 8` (regla ISO 15765-4: la dirección de petición física es la de respuesta menos 8). `parseCanHeaders(raw)` extrae los headers únicos del rango `7E8–7EF`.

**Fallback — Mode 09 PID 0A** (`ECU name`): si el broadcast `01 00` no produce ninguna respuesta (adaptador/coche que no tolera functional addressing, o bus sin OBD standard), se hace addressing físico `AT SH 7E0` + `09 0A` y se devuelve una única `EcuInfo` ECM (`7E0`/`7E8`) con el nombre leído. Si también falla, `[]`.

**Un único mecanismo, emulador = coche real**: no hay una rama "simulación" con datos fake ni otra "real". El mismo auto-scan corre contra el emulador Docker y contra un coche físico por USB/TCP — la única diferencia es qué responde el bus (el emulador hoy solo responde `7E8`; un coche real puede responder `7E8`+`7E9`+…). Que el emulador devuelva solo una ECU es **válido y esperado**, no algo a parchear. El `ObdSimulatorRepository` (simulador interno) es un fixture de test que sigue devolviendo `scenario.ecus`, no una fuente de catálogo de ECUs del vehículo.

**Rechazado**: sondear la parrilla completa de direcciones físicas ISO 15765-4 (`7E0…7E7`, 8 round-trips) como mecanismo primario. Es más lento (~8 comandos vs 1 broadcast), más código, y el functional addressing ya lo cubre. La parrilla queda como posible extensión, no como base.

**Rechazado**: descubrimiento solo por Mode 09 PID 0A. Solo devuelve la ECU primaria (ECM), nunca el set completo de módulos — no cumple el objetivo Autel de "listar todas las ECUs".

### Decision 2: Mapeo dirección CAN → nombre/tipo — solo estándar ISO 15765-4 (sin catálogo de simulación)

**Elegido**: el mapeo dirección → nombre/tipo usa **únicamente** el estándar ISO 15765-4, que solo estandariza **una** dirección física: `7E0/7E8 = ECM (Engine Control Module)`. No se hardcodea ningún otro nombre por escenario ni se copian los nombres del simulador:

| response | request | type | name |
|---|---|---|---|
| 7E8 | 7E0 | ECM | Engine Control Module |

Toda dirección de respuesta distinta de `7E8` → `type = 'UNKNOWN'`, `name = 'ECU <response_addr>'` y `request = response − 8` (derivación aritmética ISO 15765-4). **Nunca se inventa un nombre ni un tipo** para direcciones no estandarizadas: un header `7E9`, `768`, `7DA`, `728`… se devuelve como `UNKNOWN`, no como "TCM"/"ABS"/"SRS"/"IPC".

La implementación vive en una constante pura de dominio (`domain/ecuAddressCatalog.ts`) con una única entrada estándar y una función `resolveEcuAddress(responseAddr)` que: (a) devuelve la entrada estándar si existe, (b) si no, deriva `request = response − 8` y devuelve `UNKNOWN`.

**El emulador se trata como un coche real**: que el escenario del emulador responda solo `7E8` (ECM) es un comportamiento **válido y esperado**, no una limitación a parchear. El set multi-ECU aparecerá de forma natural cuando se conecte un coche real con más módulos en el bus; los módulos adicionales no estandarizados se mostrarán como `UNKNOWN` hasta que se aprendan (Decisión 8).

**Rechazado**: hardcodear las direcciones que el simulador interno (`seedScenarios.ts`) modela (`7E9` TCM, `768` ABS, `7C8` BCM, `7DA` SRS, `728` IPC) como si fueran un "catálogo estándar". No lo son: fuera de `7E0/7E8`, las direcciones físicas las asigna cada fabricante y no hay convención universal. Inventar nombres en producción violaría "nunca inventes" (principio del catálogo auto-expansivo, ADR 007).

**Rechazado**: **pre-seedear** una tabla `ecu_type_catalog` (manufacturer/model/response_addr → type/name) en BD con direcciones específicas de fabricante (`7E9` TCM, `768` ABS, …). No hay dataset fiable y violaría "nunca inventes" (ADR 007). El aprendizaje de direcciones por fabricante se cubre con el catálogo auto-expansivo de la **Decisión 8** (`ecu_definitions` + `ecus_index`, que nacen vacíos y se llenan con `web_search`/mecánico), no con un seed precargado.

### Decision 3: Nivel "sistema" como campo `system` en `pid_definitions` (no tabla `systems`)

**Elegido**: columna `system text` (nullable) en `pid_definitions`.

- **KISS**: `system` es una **etiqueta de agrupación** para presentación/filtrado ("Engine", "Battery", "Exhaust"), no una entidad con ciclo de vida propio. Una tabla `systems` con FK obligaría a un JOIN por cada lectura de PID y a mantener una identidad separada sin beneficio.
- **El unique index `(mode, pid_code, manufacturer, model)` no cambia**: `system` es metadato derivado de la misma definición, no parte de su identidad. Añadirlo al index rompería la idempotencia del seed (el mismo PID podría insertarse dos veces con `system` distinto).
- **DRY**: no hay atributos de "sistema" (descripción, confianza, ícono) que `pid_definitions` no pueda llevar como columna. Normalizar ahora sería una factory de factories.
- Coherente con la deuda vectorial documentada: preferir schema-lite; si mañana hace falta un catálogo canónico de sistemas, se promueve `system` string → tabla por migración.

**Rechazado**: tabla `systems` (id, name, description) + FK `system_id` en `pid_definitions`. Over-normalización; complica el unique index y el seed idempotente; no aporta nada observable hoy.

Valores seedeados (vocabulario controlado, documentado en el entity): `Engine`, `Transmission`, `Battery`, `Exhaust`, `Emissions`, `Vehicle`, `Powertrain`, `ABS`, `Body`, `Airbag`, `Instrument`. Los PIDs Mode 01 universales se etiquetan `Engine` por defecto (J1979 es motor-céntrico) salvo los evidentes (`0D` speed → `Vehicle`, `2F` fuel level → `Vehicle`, `46` ambient → `Vehicle`).

### Decision 4: `pid_readings` — `mode`+`pid_code` autodescriptivo; `pid_def_id` se mantiene; `session_id` pasa a FK entera

**Elegido**:

```
pid_readings:
  id            integer PK
  session_id    integer NOT NULL FK → diagnosis_sessions.id   (antes text)
  mode          text    NOT NULL                              (nuevo)
  pid_code      text    NOT NULL                              (nuevo)
  pid_def_id    integer FK → pid_definitions.id  NULL         (se mantiene, nullable)
  raw_hex       text    NOT NULL
  parsed_value  real
  timestamp     text    NOT NULL default datetime('now')
  index (session_id)
```

- **`mode`+`pid_code` son la identidad autodescriptiva**: una lectura se interpreta sin JOIN. Resuelve el problema de las lecturas huérfanas: hoy si `pid_def_id` es null (lo habitual en lecturas en vivo) la fila es irrecuperable.
- **`pid_def_id` se mantiene nullable**: es un *soft link* a la definición canónica cuando existe (para "¿con qué fórmula exacta se produjo este valor?"). No se elimina porque conserva valor analítico y no estorba. Se vuelve opcional, nunca obligatorio.
- **`session_id` pasa a FK entera → `diagnosis_sessions.id`**: el `text` actual es lossy y no joinable; con FK se habilita "las lecturas de la sesión N" y la integridad referencial. El flujo `persistPidReading` solo escribe cuando hay `sessionId` (sesión ya creada antes de montar el MCP server), así que nunca se inserta `NULL`.

**Rechazado**: eliminar `pid_def_id` por completo. Perdería el vínculo a la fórmula/definición que produjo el valor parseado, útil para auditoría del catálogo auto-expansivo (ADR 007).

**Rechazado**: mantener `session_id` como `text`. Impide JOINs y queries de historial por sesión, que es exactamente lo que "live data de sesión" necesita.

### Decision 5: Migración 0005 — rebuild de tablas, idempotencia por journal

**Elegido**: una única migración `0005_*.sql` con dos operaciones:

1. **`pid_definitions`**: rebuild por patrón `__new_` + copy + drop + rename (igual que migración 0002), eliminando `vehicle_id` y `ecu_id` y añadiendo `system text`. El unique index se re-crea igual (`mode, pid_code, manufacturer, model`).
2. **`pid_readings`**: rebuild con el nuevo esquema (add `mode`/`pid_code` NOT NULL, `session_id` integer FK, `pid_def_id` nullable, index en `session_id`).

**Impacto en datos**:
- `pid_definitions`: las filas seed (20 Mode 22) no usan `vehicle_id`/`ecu_id` (van a null), así que no pierden nada. Las filas `source='auto'` registradas por `autoRegisterPid` con `vehicle_id` set pierden ese vínculo — correcto, porque ese vínculo era el diseño equivocado que se elimina; su scope real era `manufacturer`/`model` (ya persistido).
- `pid_readings`: **se vacía**. Las lecturas son efímeras por diseño (el propio modelo Autel las llama "lecturas efímeras"); no hay valor de negocio en migrar `text → integer` de session_ids antiguos que no referencian sesiones reales. Se documenta el reset.

**Idempotencia**: garantizada por el journal de Drizzle (`meta/_journal.json`); cada migración se aplica exactamente una vez. El patrón `__new_` + `DROP TABLE`/`RENAME` es seguro ante re-ejecución accidental si se añade guard `DROP TABLE IF EXISTS`.

**Regla de proyecto respetada**: el schema de Drizzle **no se cambia sin discusión previa** — esta decisión queda documentada aquí para revisión del usuario antes de implementar (ver "Queda abierto" al final).

### Decision 6: Pruebas sin hardware — mock de transporte (primario) + emulador (solo handshake AT)

**Elegido**:
1. **Mock de `Elm327Transport`** en tests unitarios: un doble que guiona respuestas AT → tramas. Es el mecanismo primario. Verifica el algoritmo completo (secuencia AT emitida, headers parseados, mapeo dirección→tipo, fallback Mode 09 0A) de forma determinista.
2. **Emulador Docker (Ircama ELM327-emulator)**: valida que el handshake AT (`AT E0`/`AT H1`/`AT SP 6`/`AT SH 7DF`) no rompe la sesión y que el fallback a 09 0A produce una ECU. **No** valida multi-ECU (ver Hallazgos).
3. La lógica de parseo (`parseCanHeaders`) es una función pura → testeada exhaustivamente sin transporte.

La separación es por capa: `ecuDiscovery.ts` (infrastructure) consume `Elm327Transport` (inyectado) + `parseCanHeaders` (pura) + catálogo (domain). Testear cada pieza por separado mantiene el test unitario sin I/O.

### Decision 7: Coherencia ADR 003/007 y spec `ecu-info-screen`

- **ADR 003 (MCP)**: sigue válido. `get_ecu_info` ya está registrado; el cambio altera la **semántica** de su resultado (ECUs reales descubiertas en vez de `[]`/sintética), no el protocolo ni el error-handling. No requiere edición, pero se recomienda añadir `get_ecu_info` a la tabla de tools (hoy omitida) como mejora documental opcional.
- **ADR 007 (catálogo auto-expansivo)**: este cambio **extiende** ADR 007. Al quitar `vehicle_id`/`ecu_id` de `pid_definitions` el catálogo queda puramente fabricante/modelo, que es el scope que LanceDB ya asume en sus metadatos (`manufacturer`, `model`). Además añade un cuarto índice (`ecus_index`) a los tres existentes (`pids_index`/`dtcs_index`/`diagnoses_index`) para el aprendizaje de direcciones de ECU (Decisión 8). El campo `system` es candidato a añadirse como metadato en `pids_index` más adelante. El ADR 007 en sí no se modifica (registro histórico); su tabla de índices se actualiza como nota en la documentación del TFM si procede.
- **`ecu-info-screen` spec**: queda **superseded en sus escenarios TCP**. Dice que `getEcuInfo()` en modo TCP devuelve "una única EcuInfo sintética (`Engine Control Unit`, 7E0/7E8)". Este cambio lo reemplaza por descubrimiento real. El delta spec reescribe explícitamente esos escenarios; al archivar/sincronizar se actualizará `openspec/specs/ecu-info-screen/spec.md`.

### Decision 8: Catálogo auto-expansivo de ECUs — vacío + aprendizaje (opción B)

**Elegido**: el conocimiento de ECUs se organiza en **dos niveles**:

1. **Código** (`domain/ecuAddressCatalog.ts`, Decisión 2): constante pura con la única dirección estandarizada `7E0/7E8 = ECM`. Inmutable.
2. **Base de datos** (`ecu_definitions` SQLite + `ecus_index` LanceDB): el catálogo auto-expansivo que **nace vacío** y se llena por aprendizaje (opción B, elegida por el usuario). No se precarga ningún mapa vehículo-específico.

**Estructura**:

```
ecu_definitions (SQLite):
  id             integer PK
  manufacturer   text NOT NULL
  model          text NOT NULL
  response_addr  text NOT NULL
  request_addr   text NOT NULL
  name           text NOT NULL
  type           text NOT NULL
  system         text            -- vocabulario controlado (Engine, Transmission, ABS…)
  confidence     real NOT NULL default 0.3
  source         text NOT NULL default 'web'   -- 'web' | 'mechanic'
  created_at     text NOT NULL default datetime('now')
  unique (manufacturer, model, response_addr)
```

`ecus_index` (LanceDB): espejo vectorial con los mismos metadatos (para búsqueda semántica por el LLM).

**Resolución**: tras el auto-scan, cada ECU `UNKNOWN` se busca en `ecu_definitions` por `(manufacturer, model, response_addr)`. Si hay match con `confidence ≥ 0.7` (mecánico 0.8 o validado), se resuelve a `name`/`type` reales; si no (web 0.3 pendiente de validación), se mantiene `UNKNOWN`. La resolución ocurre en `handleGetEcuInfo` (que dispone de `manufacturer`/`model` del `sessionContext`), no en el adapter (context-free). `persistEcus` guarda en `ecus` el nombre/tipo resuelto — el schema de `ecus` **no cambia**.

**Aprendizaje (INSERT)**: cuando se obtiene información de una dirección desconocida (vía `web_search` → `confidence 0.3`, o aportación del mecánico → `0.8`), se hace INSERT en `ecu_definitions` + `ecus_index` mediante la tool MCP `index_ecu`. La búsqueda semántica previa usa `search_similar_ecus` (espejo de `search_similar_dtcs`).

**Validación**: las ECUs **no tienen validación OBD** (no existe comando que confirme "el `7E9` es la transmisión"; solo el ECM se valida vía `09 0A`). Por eso la confianza sale de la fuente (web 0.3 / mecánico 0.8), sin el paso "readPid → rango" que sí tienen los PIDs. Consecuencia: una ECU aprendida por web (0.3) no se resuelve automáticamente hasta que el mecánico la confirme (0.8).

**Rechazado**: seed precargado de ECUs (opciones A y C). El usuario eligió B: catálogo vacío que aprende con el uso.

## Hallazgos del emulador y transporte (condicionan el diseño)

1. **El emulador (Ircama ELM327-emulator) soporta los comandos AT necesarios a nivel ELM**: `AT SH` (`AT_SET_HEADER`), `AT H1` (`AT_USE_HEADERS`), `AT SP` (`AT_PROTO`), `AT CRA` (`AT_SET_CAN_RX_ADDR`), `AT E0`, `AT L0`, `AT S0`. Confirmado en `elm.py` / `obd_message.py`. → El handshake AT del scan no rompe el emulador.
2. **El emulador es single-ECU por escenario**: cada PID del escenario tiene `Header: ECU_ADDR_E` (7E0) y responde siempre `ECU_R_ADDR_E` (7E8). No simula múltiples ECUs respondiendo a un broadcast con headers distintos. → Con el emulador, el functional addressing devolverá **una** ECU (7E8) — comportamiento válido y esperado, como un coche real con un solo módulo en el bus. El multi-ECU (varios módulos respondiendo) se prueba con el mock de transporte y aparecerá en coche real si el bus tiene más módulos.
3. **El emulador deriva la respuesta como `request_header + 8`** (en `uds_answer`), coherente con la regla ISO 15765-4 que usa el diseño (`response = request + 8`, inversa `request = response − 8`). Confirma la regla aritmética de derivación.
4. **Mode 09 PID 0A (`ECU name`) NO está definido en los escenarios del emulador** (`audi_a3_tdi.py`, `kawasaki_z900.py`, `run_toyota.py`, ni en `default`). → El fallback 09 0A no se puede validar contra el emulador actual; debe cubrirse con mock (o añadir `090A` al escenario, fuera de alcance).
5. **`reliableTransport.sendCommand` resuelve al primer `>`** en el buffer acumulado. Con headers activos y functional addressing, el ELM327 emite todas las respuestas antes del prompt final `>`, así que `sendCommand('01 00')` tras `AT SH 7DF` recibe todas las líneas en una sola resolución. Riesgo: si un adaptador real intercala `>` (p. ej. tras `SEARCHING...`), el scan truncaría. El diseño lo mitiga reintentando con `AT ST FF`/timeout y asumiendo que en bus conectado no hay `SEARCHING`. **Queda abierto** validar en coche real.
6. **El emulador responde solo `7E8` (ECM) — y eso es válido**. El `ObdSimulatorRepository` (simulador interno) tiene ECUs con nombres variados (`TCM`, `ABS`, `BCM`, `SRS`, `IPC`), pero es un fixture de test, no una referencia de direcciones reales. Fuera de `7E0/7E8` (estandarizada), las direcciones las asigna cada fabricante; por eso el diseño las devuelve `UNKNOWN` (Decisión 2) y su resolución a nombre/tipo se cubre con el catálogo auto-expansivo de la Decisión 8 (`ecu_definitions` + `ecus_index`).

## Riesgos

- **Catálogo de ECUs vacío al inicio (opción B)**: en el demo solo se resolverá `7E8` (ECM); cualquier otra ECU aparecerá como `UNKNOWN` hasta que se aprenda. Es el comportamiento esperado, no un fallo. El catálogo crece con `index_ecu`.
- **`session_id` FK y sesiones huérfanas**: si `persistPidReading` llegara a ejecutarse con un `sessionId` inexistente, la FK violaría y el `.catch()` lo traga (fire-and-forget). Mitigación: la sesión se crea antes del MCP server; además `insertPidReading` sigue envuelto en `.catch()`.
- **Adapters reales con `>` intercalados** en el scan funcional (Hallazgo 5): el multi-frame se truncaría. Se documenta como limitación y se valida en coche real; el fallback 09 0A cubre el caso degenerado.
- **Drop de columnas en SQLite**: el rebuild `__new_` es seguro, pero requiere `PRAGMA foreign_keys=OFF` durante la migración (patrón ya usado en 0002) para no arrastrar constraints.
- **`findPidsByVehicle` desaparece**: `handleGetAvailablePids` (tool `get_available_pids`) es el único consumidor. Se reemplaza por lookup por `manufacturer`/`model` del `sessionContext`, con fallback a `findPidsByMode`. Si un llamador externo pasaba `vehicleId`, pierde el scope por vehículo — comportamiento intencionado (los PIDs ya no son por vehículo).
- **`system` nullable**: la UI que consuma PIDs debe tolerar `system === null` (no romper el render). Fuera de alcance de este cambio, pero se documenta.
