# ECU Discovery and System Catalog

## Purpose

El sistema descubre físicamente las unidades de control electrónico (ECUs) presentes en el bus CAN del vehículo conectado mediante auto-scan por functional addressing, y organiza el catálogo de PIDs por sistema/ECU a nivel fabricante/modelo. Además mantiene un catálogo auto-expansivo de ECUs (vacío al inicio) que aprende direcciones → nombre/tipo/sistema con el uso. Sustituye el comportamiento previo en el que `getEcuInfo()` en modo TCP devolvía `[]` (o una ECU sintética) y en el que `pid_definitions` estaba atado a un vehículo concreto (`vehicle_id`/`ecu_id`) en vez de a fabricante/modelo. Las lecturas de PID pasan a ser autodescriptivas (`mode` + `pid_code`) y ligadas a sesión por FK.

## MODIFIED Requirements

### Requirement: Descubrimiento de ECUs por functional addressing CAN
El sistema SHALL consultar al adaptador qué protocolo negoció con el vehículo **antes** de
emitir ningún comando de configuración, y SHALL derivar de él la dirección de broadcast
funcional. El sistema NO SHALL imponer un protocolo de bus: la negociación es del init y el
barrido solo la lee.

El barrido SHALL cubrir los cuatro protocolos CAN de ISO 15765-4 —11 y 29 bits, a 500 y
250 kbps— mapeando cada dirección de respuesta a una `EcuInfo` con `responseAddr`,
`requestAddr` derivado según el ancho de dirección, `type`/`name` resueltos desde el
catálogo (que solo estandariza el ECM; el resto SHALL resolverse como `UNKNOWN`) y
`protocol` reflejando el bus realmente negociado.

#### Scenario: El barrido lee el protocolo antes de configurar nada
- **GIVEN** un `Elm327Transport` conectado a un vehículo que negoció CAN 11 bits / 500 kbps
- **WHEN** se invoca `getEcuInfo()`
- **THEN** el primer comando emitido es la consulta del protocolo negociado
- **AND** no se emite ningún comando que fije el protocolo del bus

#### Scenario: Broadcast multi-ECU en CAN de 11 bits
- **GIVEN** un vehículo en CAN 11 bits que, tras headers ON y broadcast funcional, responde a `01 00` con `7E8 06 41 00 BE 3F A8 13` y `7E9 06 41 00 ...`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve 2 `EcuInfo`: la `7E8` con `type = 'ECM'` (7E0→7E8) y la `7E9` con `type = 'UNKNOWN'` (7E1→7E9)
- **AND** `requestAddr` se deriva aritméticamente (`respuesta − 8`)

#### Scenario: Broadcast multi-ECU en CAN de 29 bits
- **GIVEN** un vehículo que negoció CAN 29 bits y responde desde `18DAF110` y `18DAF111`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** el broadcast se dirige a la dirección funcional de 29 bits, no a la de 11
- **AND** devuelve 2 `EcuInfo`: `18DAF110` como ECM con petición `18DA10F1`, y `18DAF111` como `UNKNOWN` con petición `18DA11F1`

#### Scenario: El protocolo del bus se refleja en la ECU descubierta
- **GIVEN** un vehículo que negoció CAN 11 bits a 250 kbps
- **WHEN** se descubre una ECU
- **THEN** su `protocol` corresponde a ese bus, no a una constante fija

#### Scenario: En un bus pre-CAN el barrido se abstiene sin tocar el adaptador
- **GIVEN** un vehículo que negoció un protocolo anterior a CAN (ISO 9141-2, KWP2000 o J1850)
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]`
- **AND** el único comando emitido es la consulta del protocolo — no se altera ni el header, ni el eco, ni el protocolo del adaptador
- **AND** las lecturas posteriores de PID, DTC y VIN siguen funcionando igual que antes del barrido

#### Scenario: Un protocolo irreconocible se trata como no soportado
- **GIVEN** un adaptador que responde a la consulta de protocolo con algo que no identifica ningún bus conocido
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]` sin emitir ningún comando de configuración
- **AND** no se supone un protocolo por defecto

#### Scenario: Headers duplicados se deduplican
- **GIVEN** una respuesta broadcast con `7E8` repetido (dos tramas del mismo módulo)
- **WHEN** se parsea la respuesta
- **THEN** se devuelve una única `EcuInfo` para `7E8`

#### Scenario: Headers fuera del direccionamiento OBD se ignoran
- **GIVEN** una respuesta en CAN 11 bits con headers `7E8`, `7EF` y `7B8` (ABS, fuera del rango legislado)
- **WHEN** se parsea la respuesta
- **THEN** solo se devuelven ECUs para los headers en rango `7E8–7EF`
- **AND** en CAN 29 bits, se descarta toda trama que no vaya dirigida al equipo de diagnóstico

#### Scenario: Dirección desconocida usa derivación aritmética
- **GIVEN** un header `7EC` sin entrada en el catálogo ISO 15765-4
- **WHEN** se resuelve la ECU
- **THEN** devuelve `type = 'UNKNOWN'`, `name = 'ECU 7EC'`, `requestAddr = '7E4'` (7EC − 8)

#### Scenario: Emulador y coche real usan el mismo mecanismo
- **GIVEN** un bus (emulador Docker o coche real) cuyo único módulo responde con header `7E8`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve una única `EcuInfo` ECM (`7E0/7E8`)
- **AND** no existe rama de "simulación" con datos fake — el resultado es idéntico para emulador y coche real con un solo módulo

---

### Requirement: Fallback Mode 09 PID 0A cuando el broadcast no responde
El sistema SHALL caer a Mode 09 PID 0A (ECU name) con addressing físico al ECU de motor
cuando el broadcast por functional addressing no produzca ninguna respuesta, devolviendo
una única `EcuInfo` ECM. La dirección física SHALL corresponder al protocolo negociado
—`7E0`/`7E8` en 11 bits, `18DA10F1`/`18DAF110` en 29 bits—. Si tampoco responde, SHALL
devolver `[]`.

#### Scenario: Broadcast vacío y 09 0A responde
- **GIVEN** un transporte que a `01 00` (functional) devuelve vacío, y al dirigirse físicamente al ECM responde `49 0A 01 ...` a `09 0A`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve una `EcuInfo` ECM con el par de direcciones propio del protocolo negociado

#### Scenario: Broadcast vacío y 09 0A no responde
- **GIVEN** un transporte que devuelve vacío a `01 00` y `NO DATA` a `09 0A`
- **WHEN** se invoca `getEcuInfo()`
- **THEN** devuelve `[]` (no lanza error)

## ADDED Requirements

### Requirement: El barrido deja el adaptador listo para las lecturas normales
El sistema SHALL restaurar, al terminar el barrido, la configuración que las lecturas
necesitan: cabeceras apagadas y las peticiones dirigidas al ECU de motor del protocolo
negociado. La dirección de broadcast SHALL quedar deshecha — sirve para preguntar quién hay
en el bus, no para leer parámetros, y dejarla puesta deja las lecturas sin respuesta. La
restauración SHALL ejecutarse también cuando el barrido falla, y el sistema NO SHALL dejar
el adaptador fijado a ningún protocolo.

#### Scenario: Las lecturas se comportan igual antes y después de un barrido
- **GIVEN** un vehículo del que se leen los PID de telemetría correctamente
- **WHEN** se ejecuta un barrido de ECUs y a continuación se repiten las mismas lecturas
- **THEN** devuelven valores equivalentes a los de antes del barrido

#### Scenario: El estado se restaura aunque el barrido falle
- **GIVEN** un bus que corta la comunicación en mitad del broadcast
- **WHEN** el barrido lanza el error correspondiente
- **THEN** el adaptador queda igualmente con las cabeceras apagadas y las peticiones dirigidas al ECU de motor

#### Scenario: Un fallo del barrido no deja el vehículo inaccesible
- **GIVEN** un barrido que ha fallado sobre un vehículo real
- **WHEN** se solicita a continuación la telemetría en vivo
- **THEN** responde con datos, sin necesidad de reiniciar la aplicación
