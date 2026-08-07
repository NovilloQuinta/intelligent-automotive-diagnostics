# Cognitive Pid Discovery

## Purpose

Catálogo de metadata para los PIDs que el flujo cognitivo/simulado puede leer (nombre, unidad, rango operativo saludable), enriquecimiento backend de las llamadas `read_pid` de una sesión de diagnóstico cognitivo con nombre/unidad/veredicto ok-review, e integración en el dashboard: el panel "PIDs Leídos" fusiona los 4 PIDs fijos ya existentes con los PIDs adicionales que la IA descubra, disparado automáticamente tras "Iniciar diagnóstico" sin bloquear el resto de la pantalla.

## ADDED Requirements

### Requirement: Catálogo de dominio `PidObservationCatalog`
El sistema SHALL exponer un catálogo `domain/pidObservationCatalog.ts` con metadata (`name`, `unit?`, `minValue?`, `maxValue?`) para al menos 7 PIDs Mode 01: los 4 ya usados por el diagnóstico determinista (`01 0C`, `01 05`, `01 0D`, `01 0F`) más 3 adicionales (`01 11` posición del acelerador, `01 04` carga calculada del motor, `01 42` voltaje del módulo de control). El catálogo SHALL ser independiente de la entidad `PidDefinition`/`seed-pids.ts` (pensada para bytes crudos y persistencia SQLite indexada por `vehicleId`).

#### Scenario: Consulta de metadata de un PID conocido
- **GIVEN** el catálogo `PID_OBSERVATION_CATALOG`
- **WHEN** se busca la clave `"01 42"`
- **THEN** devuelve `{ name: "Voltaje del módulo de control", unit: "V", minValue: 11.5, maxValue: 15.5 }`

#### Scenario: Veredicto por rango
- **GIVEN** una definición de catálogo con `maxValue` definido
- **WHEN** se invoca `resolvePidObservationStatus(value, def)` con `value > maxValue`
- **THEN** devuelve `"review"`

#### Scenario: Veredicto por rango inferior
- **GIVEN** una definición de catálogo con `minValue` definido (p. ej. `01 42`)
- **WHEN** `value < minValue`
- **THEN** devuelve `"review"`

#### Scenario: PID sin umbrales definidos
- **GIVEN** una definición de catálogo sin `minValue` ni `maxValue` (p. ej. `01 0D`, velocidad)
- **WHEN** se invoca `resolvePidObservationStatus` con cualquier valor
- **THEN** devuelve siempre `"ok"`

---

### Requirement: Escenarios simulados con PIDs adicionales
El sistema SHALL extender los escenarios semilla (`audi-a3-idle`, `kawa-z900`) con un `pidValues` que incluya lecturas simuladas para `01 11`, `01 04` y `01 42`, reutilizando el mecanismo `SimulationScenario.pidValues` ya soportado por `ObdSimulator.readPidValue`.

#### Scenario: Escenario Audi A3 al ralentí — lecturas saludables
- **GIVEN** el escenario `audi-a3-idle`
- **WHEN** se lee `01 42` (voltaje del módulo de control) vía `read_pid`
- **THEN** el valor está dentro de `[11.5, 15.5]` y el veredicto derivado es `"ok"`

#### Scenario: Escenario Kawasaki Z900 — voltaje bajo detectable solo por la IA
- **GIVEN** el escenario `kawa-z900`
- **WHEN** se lee `01 42` vía `read_pid`
- **THEN** el valor está por debajo de `11.5` y el veredicto derivado es `"review"`, evidenciando una anomalía no visible en los 4 PIDs fijos

---

### Requirement: Endpoint `POST /api/mcp/cognitive-diagnosis` no bloqueado por PIDs desconocidos
El sistema SHALL permitir que la IA lea PIDs fuera del catálogo `PidObservationCatalog` sin que ello afecte al resto de la sesión: las lecturas `read_pid` correspondientes no generan una `PidObservation` (se descartan silenciosamente), pero el diagnóstico narrativo y el resto de `toolCalls` continúan sin interrupción.

#### Scenario: Lectura de un PID fuera de catálogo
- **GIVEN** una sesión cognitiva donde el LLM llama `read_pid` con un código no presente en `PID_OBSERVATION_CATALOG`
- **WHEN** se deriva `pidObservations` a partir de `toolCalls`
- **THEN** esa llamada no genera una entrada en `pidObservations`
- **AND** el resto de la respuesta (`diagnosis`, `severity`, `confidence`, `recommendations`, `toolCalls`) no se ve afectado

---

### Requirement: Dashboard fusiona PIDs fijos y PIDs de origen IA
El sistema SHALL disparar automáticamente el diagnóstico cognitivo tras pulsar "Iniciar diagnóstico" (mismo botón existente, sin control adicional), de forma no bloqueante y solo si `api.getCapabilities().cognitiveDiagnosis` es `true`. El panel "PIDs Leídos" SHALL fusionar los 4 PIDs fijos con las `PidObservation` recibidas, sin duplicar los 4 códigos fijos, marcando visualmente el origen de cada fila.

#### Scenario: Capacidad cognitiva disponible
- **GIVEN** `getCapabilities().cognitiveDiagnosis === true` y un usuario que pulsa "Iniciar diagnóstico"
- **WHEN** el diagnóstico determinista (`POST /api/diagnosis`) completa
- **THEN** se dispara automáticamente `getCognitiveDiagnosis()` sin bloquear la pintura de severidad/DTCs/PIDs fijos
- **AND** al resolver, las filas de origen IA se añaden al panel "PIDs Leídos" marcadas visualmente, sin duplicar `01 0C`/`01 05`/`01 0D`/`01 0F`

#### Scenario: Capacidad cognitiva no disponible
- **GIVEN** `getCapabilities().cognitiveDiagnosis === false`
- **WHEN** el usuario pulsa "Iniciar diagnóstico"
- **THEN** no se invoca `getCognitiveDiagnosis()`
- **AND** el panel "PIDs Leídos" muestra únicamente los 4 PIDs fijos, igual que hoy

#### Scenario: Fallo silencioso del diagnóstico cognitivo
- **GIVEN** `getCapabilities().cognitiveDiagnosis === true` pero `getCognitiveDiagnosis()` falla (timeout o error)
- **WHEN** el usuario pulsa "Iniciar diagnóstico"
- **THEN** el diagnóstico principal (severidad, DTCs, 4 PIDs fijos) se muestra con normalidad
- **AND** no se muestra un error bloqueante ni un `toast` — como mucho un indicador discreto de que no hay PIDs adicionales de IA
