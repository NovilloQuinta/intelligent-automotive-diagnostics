# Prompt para opencode

Copia todo lo que hay debajo de la línea y pégalo en opencode.

---

Lee `AGENTS.md` antes de nada y sigue sus reglas de sesión (orquestar antes de actuar, TDD estricto, trabajar en rama desde `develop`, preguntar antes de commitear).

## Contexto

La UI del dashboard OBD tiene 5 defectos detectados en prueba manual el 8 agosto 2026. El análisis, el diseño y las tareas ya están escritos en:

`openspec/changes/fix-vehicle-identity-and-live-data/`

Léelos (`proposal.md`, `design.md`, `tasks.md`, `specs/`) antes de tocar código. **No rediseñes lo que ya está decidido ahí.** Si algo del plan te parece equivocado, dilo y espera respuesta; no lo cambies por tu cuenta.

Causa común de tres de los cinco: el proyecto migró de un simulador propio (`infrastructure/simulation/simulator.ts`) al emulador ELM327 real por TCP (`infrastructure/elm327/elm327Adapter.ts`), y el adaptador nuevo nunca recuperó funcionalidad que el simulador sí tenía. Son regresiones, no funcionalidad nueva.

## Los 5 arreglos, en este orden

Haz **uno cada vez**. Al terminar cada uno, para, informa de qué debe comprobar el usuario en la UI, y espera su OK antes de seguir con el siguiente.

### 1. Descripciones de los DTC

- El VO `DtcCode` tiene campo `description` y la UI ya lo pinta (`apps/ui/src/components/dashboard/DtcPanel.tsx:86`), pero `elm327Adapter.ts:103` construye los códigos sin descripción.
- No existe catálogo de DTCs en el backend (hay `seed-pids.ts`, no hay equivalente para DTCs).
- Crear `apps/core-api/src/domain/dtcCatalog.ts` con subconjunto SAE J2012: mínimo P0301, P0401, P2002 más genéricos P0xxx frecuentes.
- **Invariante:** un código ausente del catálogo se entrega con `description: ''`. Nunca derivar la descripción de la familia del código ni inventarla. Ese hueco lo rellenará después el RAG.
- Verificación: diagnóstico del Audi → los tres códigos con descripción visible.

### 2. Refresco al cambiar de vehículo

- `apps/ui/src/components/dashboard/useDiagnosis.ts:11` guarda `result` en `useState` y nunca lo limpia al cambiar `selectedId`. Igual `useCognitiveDiagnosis.ts` con `pidRows`.
- `DashboardPage.tsx:42` sí resetea `selectedDtc`, pero se olvidó del resto.
- Migrar ambos a TanStack Query (`@tanstack/react-query`, ya en dependencias) con `queryKey` que incluya `selectedId`. El diagnóstico es una mutación disparada por botón cuyo resultado se cachea bajo esa clave.
- Verificación: diagnosticar el Audi, cambiar a Kawasaki, no debe quedar ni un dato del Audi.

### 3. Identificación del vehículo

- `elm327Adapter.ts:121` construye el vehículo deduciéndolo solo del VIN: `model` y `engineType` quedan siempre `'unknown'`.
- Los escenarios `docker/elm327/scenarios/audi_a3_tdi.py` y `kawasaki_z900.py` **no definen Mode 09 PID 02**, así que el VIN falla y cae a `FALLBACK_VIN`.
- Añadir Mode 09 PID 02 a ambos escenarios (`WAUZZZ8V5JA123456`, `JKAZR2A1XLA000111`) y parchear el VIN del Toyota en `run_toyota.py` (`JTDKN3DU60A123456`), con el mismo patrón de parcheo de `ObdMessage` que usa `run_audi.py`.
- `DiagnosisService.getVehicleInfo` debe fusionar el VIN leído del ECU con `make`/`model`/`year`/`engineType` del `ScenarioDescriptor` (`composition.ts:130`). **El VIN siempre es el leído del ECU, nunca el del catálogo.**
- En modo TCP directo no hay descriptor: mantener el comportamiento actual (`model`/`engineType` a `unknown`), que es la respuesta correcta contra un coche real.
- Verificación: el wizard del Audi muestra VIN real, marca Audi, modelo A3, año 2018, motor 2.0 TDI.

### 4. Freeze frame

- `elm327Adapter.ts:85` pide un único PID hardcodeado (`02 0C`) y el parámetro `dtc` solo se usa como etiqueta, no para leer.
- Leer un conjunto de PIDs Mode 02 (`04`, `05`, `0C`, `0D`, `11`) con degradación por PID: un `NO DATA` en uno no invalida el resto. `null` solo si ninguno responde.
- Usar el `dtc` para seleccionar el frame real.
- Ampliar el escenario del Audi con los Mode 02 que faltan y frames distinguibles por DTC.
- Verificación: clicar P0301 y P0401 muestra valores distintos.

### 5. Telemetría real

- `apps/ui/src/components/dashboard/useLiveTelemetry.ts` genera los valores con `apps/ui/src/lib/jitter.ts` en el navegador, sin tocar el vehículo. En modo TCP directo el escenario tiene los sensores a cero, así que con un coche real los relojes marcarían 0.
- Endpoint nuevo `GET /api/live-data?scenarioId=` que reutiliza `readPid` para los 4 PIDs del dashboard, siguiendo el patrón de `ecuInfo`/`freezeFrame` en `DiagnosisController` (schema Zod required/optional según `isDirectConnection`) + rate limit propio.
- Degradación por PID: uno que falla llega a `null`, el resto con valor.
- UI: los gauges leen del endpoint con `refetchInterval` de **1000 ms**, en constante con nombre y TSDoc.
- **La cadencia baja de 2 Hz a 1 Hz a propósito**: el transporte ELM327 serializa los comandos en una única conexión TCP con cola FIFO; contra un adaptador real cada PID cuesta 50-100 ms y son 4 lecturas secuenciales. A 2 Hz las peticiones se solapan.
- Borrar `useLiveTelemetry.ts`, `lib/jitter.ts` y sus tests.
- Verificación: los gauges y la tabla de PIDs muestran los mismos valores del mismo vehículo.

## Restricciones

- **TDD estricto**: RED (test que falla) → GREEN (código mínimo) → REFACTOR. Sin excepciones.
- **No instalar ninguna librería de terceros.** Si crees que hace falta una, para y pregunta con la justificación y la alternativa sin ella.
- **No commitear ni pushear sin OK humano** (regla 7 de `AGENTS.md`).
- **No mergear a `develop`** salvo petición explícita.
- Rama: `fix/vehicle-identity-and-live-data`, creada desde `develop`.
- Antes de cada tarea, comprobar el baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` y `pnpm test:ui`.
- Los emuladores tienen que estar levantados: `docker compose up -d`. Para inspeccionar respuestas: `pnpm obd:send "09 02"`.
- Deuda conocida: `pnpm lint` de `apps/ui` falla por el override de `brace-expansion` (documentado en `AGENTS.md`). No intentes arreglarlo, está fuera de alcance.
- Marca las tareas completadas en `openspec/changes/fix-vehicle-identity-and-live-data/tasks.md` según avances.

## Fuera de alcance

No toques nada de esto, aunque lo veas roto o incompleto:

- Chat conversacional con la IA (multi-turno) — cambio aparte, pendiente.
- Conexión por cable USB / Bluetooth — cambio aparte, pendiente.
- Publicación de la web — pendiente.
- Descubrimiento real de ECUs (`getEcuInfo` devuelve una ECU fija).
- Poblar el índice vectorial de DTCs — es `add-knowledge-mcp-tools`.
