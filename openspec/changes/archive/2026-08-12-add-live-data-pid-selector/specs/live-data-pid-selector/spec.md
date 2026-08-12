## live-data-pid-selector

### ADDED

#### Requirement: Multi-PID OBD request

El sistema DEBE permitir leer múltiples PIDs en un solo comando ELM327 (`01 0C 0D 05 0F`) en lugar de comandos individuales secuenciales.

##### Scenario: Multi-PID Mode 01 request
- GIVEN un vehículo conectado por ELM327
- WHEN el repositorio recibe `readPids('01', ['0C', '0D', '05'])`
- THEN envía un solo comando `01 0C 0D 05` al transporte
- AND parsea la respuesta multi-línea `0: 41 0C ...\n1: 41 0D ...\n2: 41 05 ...`
- AND devuelve `Map { '0C' => valor, '0D' => valor, '05' => valor }`

##### Scenario: Degradación por PID individual
- GIVEN una respuesta multi-PID donde un PID responde `NO DATA`
- WHEN el repositorio parsea la respuesta
- THEN el PID fallido se omite del Map
- AND los demás PIDs mantienen sus valores

##### Scenario: Compatibilidad con respuesta single-line
- GIVEN un adaptador ELM327 que no soporta multi-frame
- WHEN la respuesta es single-line `41 0C 0C 80>`
- THEN `parseModeResponse` sigue funcionando como antes

#### Requirement: Endpoint de live data con PIDs dinámicos

El endpoint `GET /api/live-data` DEBE aceptar un query param opcional `pids` con la lista de PIDs a leer.

##### Scenario: PIDs personalizados
- GIVEN un scenarioId válido
- WHEN se llama `GET /api/live-data?scenarioId=audi&pids=0C,0D,05`
- THEN devuelve 200 con solo los campos `rpm`, `coolantTemp`, `speed` (según mapeo de PIDs)
- AND los PIDs no solicitados no aparecen en la respuesta

##### Scenario: PIDs por defecto (compatibilidad)
- GIVEN un scenarioId válido
- WHEN se llama `GET /api/live-data?scenarioId=audi` sin query param `pids`
- THEN devuelve 200 con los 4 PIDs actuales: `rpm`, `coolantTemp`, `speed`, `intakeTemp`

##### Scenario: Validación de PIDs
- GIVEN un PID inválido (`pids=ZZ,XX`)
- WHEN se llama al endpoint
- THEN devuelve 400 con mensaje de error

##### Scenario: Límite de PIDs
- GIVEN más de 8 PIDs en el query param
- WHEN se llama al endpoint
- THEN devuelve 400 indicando el límite máximo

#### Requirement: UI de selección de PIDs

La tabla de PIDs DEBE permitir seleccionar cuáles se muestran en los gauges de telemetría en vivo.

##### Scenario: Checkboxes en PidsTable
- GIVEN PidsTable con `selectable: true`
- WHEN se renderiza
- THEN cada PID Mode 01 muestra un checkbox
- AND los PIDs Mode 22 (propietarios) no muestran checkbox

##### Scenario: Selección de PIDs
- GIVEN el usuario marca checkboxes para PIDs `0C` y `0D`
- WHEN `onPidsChange` se dispara
- THEN emite `['0C', '0D']`

##### Scenario: Límite de selección
- GIVEN el usuario tiene 8 PIDs seleccionados
- WHEN intenta marcar un noveno
- THEN el checkbox se ignora
- AND se muestra un tooltip "Máximo 8 PIDs"

##### Scenario: Gauges dinámicos
- GIVEN `TelemetrySection` recibe `pids: ['0C', '0D', '05']`
- WHEN se renderiza
- THEN muestra 3 gauges (rpm, velocidad, refrigerante)
- AND no muestra el gauge de temperatura de admisión

##### Scenario: Valor nulo en gauge
- GIVEN un PID seleccionado cuyo valor es `null` (lectura fallida)
- WHEN se renderiza su gauge
- THEN muestra `—` sin romper el layout

##### Scenario: Reset al cambiar de vehículo
- GIVEN el usuario seleccionó PIDs personalizados en el vehículo A
- WHEN cambia al vehículo B
- THEN la selección vuelve a los 4 PIDs por defecto
