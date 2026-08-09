# Diagnosis History

## Purpose

Persistencia del resultado de cada sesión de diagnóstico y consulta posterior: listado filtrable por fechas del usuario autenticado, y recuperación del informe tal como se generó ese día.

## Requirements

### Requirement: Persistencia de la sesión de diagnóstico
El sistema SHALL abrir una sesión al iniciar un diagnóstico y cerrarla al terminar, guardando el snapshot del informe, la severidad, el número de DTCs y el usuario que lo ejecutó.

#### Scenario: Diagnóstico completado con éxito
- **GIVEN** un usuario autenticado y un escenario `audi-a3-tdi`
- **WHEN** se ejecuta `ProcessVehicleDiagnosisUseCase`
- **THEN** existe una fila en `diagnosis_sessions` con `userId` del usuario, `scenarioId`, `startedAt`, `endedAt`
- **AND** `resultJson` contiene la identidad del vehículo, los DTCs con su descripción, el freeze frame y el veredicto
- **AND** `severity` y `dtcCount` están desnormalizados como columnas propias

#### Scenario: El guardado falla y el diagnóstico se devuelve igual
- **GIVEN** un repositorio de sesiones que lanza error al escribir
- **WHEN** se ejecuta un diagnóstico
- **THEN** el caso de uso devuelve el resultado del diagnóstico con normalidad
- **AND** el fallo se registra en el log
- **AND** no se propaga ninguna excepción al controlador

#### Scenario: Diagnóstico sin vehículo registrado
- **GIVEN** un diagnóstico en modo docker, donde la tabla `vehicles` no tiene fila para el escenario
- **WHEN** se guarda la sesión
- **THEN** `vehicleId` queda a `null` sin violar ninguna restricción
- **AND** la identidad del vehículo se conserva dentro de `resultJson`

---

### Requirement: Endpoint de listado de historial
El sistema SHALL exponer `GET /api/diagnosis-history` que devuelva las sesiones del usuario autenticado, ordenadas de más reciente a más antigua, paginadas, con filtros opcionales `from`, `to`, `scenarioId` y `severity`.

#### Scenario: Listado sin filtros
- **GIVEN** un usuario con 5 sesiones guardadas
- **WHEN** se hace `GET /api/diagnosis-history`
- **THEN** responde 200 con las 5 sesiones ordenadas por `startedAt` descendente
- **AND** cada entrada incluye `id`, `startedAt`, identidad del vehículo, `dtcCount` y `severity`
- **AND** ninguna entrada incluye el `resultJson` completo

#### Scenario: Filtro por rango de fechas
- **GIVEN** sesiones en varias fechas
- **WHEN** se hace `GET /api/diagnosis-history?from=2026-08-01&to=2026-08-07`
- **THEN** responde solo con las sesiones cuyo `startedAt` cae dentro del rango, ambos extremos incluidos

#### Scenario: Rango de fechas inválido
- **GIVEN** una petición con `from` posterior a `to`
- **WHEN** se hace `GET /api/diagnosis-history?from=2026-08-07&to=2026-08-01`
- **THEN** responde 400 con un mensaje de validación

#### Scenario: Aislamiento entre usuarios
- **GIVEN** dos usuarios, cada uno con sesiones guardadas
- **WHEN** el usuario A consulta el historial
- **THEN** solo recibe sus propias sesiones
- **AND** un `userId` enviado como parámetro de query se ignora por completo

#### Scenario: Sin autenticación
- **GIVEN** una petición sin token válido
- **WHEN** se hace `GET /api/diagnosis-history`
- **THEN** responde 401

#### Scenario: Paginación
- **GIVEN** un usuario con 60 sesiones
- **WHEN** se hace `GET /api/diagnosis-history?limit=25&offset=25`
- **THEN** responde con las sesiones de la 26 a la 50
- **AND** incluye el total de resultados que cumplen el filtro

---

### Requirement: Endpoint de recuperación de un informe guardado
El sistema SHALL exponer `GET /api/diagnosis-history/:id` que devuelva el snapshot completo de una sesión propia.

#### Scenario: Recuperar un informe propio
- **GIVEN** una sesión guardada del usuario autenticado
- **WHEN** se hace `GET /api/diagnosis-history/:id`
- **THEN** responde 200 con el `resultJson` completo tal como se guardó

#### Scenario: Informe de otro usuario
- **GIVEN** una sesión que pertenece a otro usuario
- **WHEN** se hace `GET /api/diagnosis-history/:id`
- **THEN** responde 404, sin revelar que la sesión existe

#### Scenario: Informe inexistente
- **GIVEN** un id que no corresponde a ninguna sesión
- **WHEN** se hace `GET /api/diagnosis-history/:id`
- **THEN** responde 404

---

### Requirement: Pantalla de historial
El sistema SHALL ofrecer una pantalla de historial accesible desde un botón del dashboard, con tabla de sesiones y filtros de fecha.

#### Scenario: Abrir el historial
- **GIVEN** un usuario autenticado en el dashboard
- **WHEN** pulsa el botón "Historial"
- **THEN** se muestra la tabla con fecha, vehículo, número de averías y severidad de cada sesión

#### Scenario: Filtrar por rango de fechas
- **GIVEN** la pantalla de historial abierta
- **WHEN** el usuario indica una fecha de inicio y una de fin
- **THEN** la tabla se recarga desde el servidor con `from` y `to`, sin filtrar en el navegador

#### Scenario: Atajos de rango
- **GIVEN** la pantalla de historial abierta
- **WHEN** el usuario pulsa "Últimos 7 días"
- **THEN** se calculan `from` y `to` en el cliente y se usan los mismos parámetros que el filtro manual

#### Scenario: Historial vacío
- **GIVEN** un usuario sin ninguna sesión guardada
- **WHEN** abre el historial
- **THEN** se muestra un mensaje explicando que aún no ha hecho ningún diagnóstico, no una tabla vacía sin contexto

#### Scenario: Filtro sin resultados
- **GIVEN** un usuario con sesiones fuera del rango seleccionado
- **WHEN** aplica el filtro
- **THEN** se indica que no hay resultados para ese rango y se ofrece limpiar el filtro

---

### Requirement: Apertura de un informe histórico
El sistema SHALL mostrar el informe guardado al seleccionar una fila del historial, sin volver a interrogar al vehículo.

#### Scenario: Abrir un informe pasado
- **GIVEN** una fila del historial
- **WHEN** el usuario hace clic sobre ella
- **THEN** se muestra `SessionReportPanel` alimentado con el snapshot recuperado
- **AND** no se emite ninguna petición de diagnóstico, ECU, freeze frame ni cognitivo

#### Scenario: El informe histórico se identifica como tal
- **GIVEN** un informe abierto desde el historial
- **WHEN** se muestra en pantalla
- **THEN** indica de forma visible la fecha en que se generó, para no confundirlo con una lectura actual
