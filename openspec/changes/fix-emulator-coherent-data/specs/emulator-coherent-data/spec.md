# Emulator Coherent Data

## Purpose

Los escenarios del emulador ELM327 exponen valores de PID consistentes con los códigos de avería que declaran, de forma que el diagnóstico cognitivo pueda razonar sobre evidencia y no sobre el propio código del DTC.

## Requirements

### Requirement: Coherencia entre averías declaradas y lecturas de sensores
El sistema SHALL exponer, en cada escenario del emulador, valores de PID consistentes con los DTCs que ese escenario declara.

#### Scenario: Fallo de encendido con carga compensada
- **GIVEN** el escenario del Audi, que declara P0301
- **WHEN** se leen la carga calculada del motor y el régimen
- **THEN** la carga al ralentí es notablemente superior a la de un motor sano
- **AND** el régimen queda por debajo del objetivo de ralentí

#### Scenario: EGR insuficiente con error marcadamente negativo
- **GIVEN** el escenario del Audi, que declara P0401
- **WHEN** se leen el EGR comandado y el error de EGR
- **THEN** el error de EGR es marcadamente negativo, no residual
- **AND** el caudal de aire es superior al de un motor sano, por no entrar gases recirculados

#### Scenario: Filtro de partículas saturado
- **GIVEN** el escenario del Audi, que declara P2002
- **WHEN** se leen la temperatura de escape y la carga de hollín
- **THEN** la temperatura de escape es superior a la de un filtro en buen estado
- **AND** la carga de hollín, expuesta por DID de Mode 22, es elevada

#### Scenario: Los valores sin relación con las averías no se alteran
- **GIVEN** el escenario del Audi
- **WHEN** se leen PIDs sin relación con P0301, P0401 ni P2002, como el nivel de combustible o la presión barométrica
- **THEN** mantienen valores normales

#### Scenario: Coherencia interna entre valores
- **GIVEN** cualquier escenario
- **WHEN** se leen el tiempo de marcha y la temperatura del refrigerante
- **THEN** la temperatura es compatible con el tiempo transcurrido desde el arranque

---

### Requirement: Freeze frame capturado en condiciones de fallo
El sistema SHALL exponer valores de Mode 02 que describan el instante en que se registró la avería, distinguibles de la lectura actual de Mode 01.

#### Scenario: El freeze frame describe un instante bajo carga
- **GIVEN** el escenario del Audi con P0301
- **WHEN** se lee el freeze frame
- **THEN** los valores corresponden a un motor bajo carga y en movimiento, no a un ralentí

#### Scenario: El freeze frame difiere de la lectura actual
- **GIVEN** el escenario del Audi
- **WHEN** se comparan los valores de Mode 02 con los de Mode 01 para los mismos PIDs
- **THEN** difieren de forma apreciable

---

### Requirement: Vehículos sin averías con valores creíbles
El sistema SHALL exponer, en los escenarios sin averías, valores propios de un vehículo sano en un régimen plausible.

#### Scenario: Motocicleta al ralentí
- **GIVEN** el escenario de la Kawasaki, sin averías declaradas
- **WHEN** se leen el régimen y la velocidad
- **THEN** el régimen corresponde a un ralentí y no a un régimen medio con el vehículo detenido

#### Scenario: El vehículo sano sirve de contraste
- **GIVEN** los escenarios sin averías
- **WHEN** se leen sus PIDs
- **THEN** todos los valores caen en rangos normales, sin ninguno fuera de rango

---

### Requirement: Historia documentada en cada escenario
El sistema SHALL documentar en cada escenario qué le ocurre al vehículo y qué valores lo sostienen.

#### Scenario: Cabecera del escenario
- **GIVEN** un escenario del emulador
- **WHEN** se lee su cabecera
- **THEN** describe las averías declaradas y qué PIDs las evidencian
- **AND** advierte de que un ralentí inestable no puede representarse con tramas fijas, solo su desplazamiento respecto al nominal

---

### Requirement: Test de coherencia
El sistema SHALL verificar mediante test que los PIDs asociados a cada DTC declarado caen en el rango correspondiente a esa avería.

#### Scenario: Escenario coherente
- **GIVEN** un escenario cuyos valores concuerdan con sus averías
- **WHEN** se ejecuta el test de coherencia
- **THEN** pasa

#### Scenario: Valor incoherente introducido
- **GIVEN** un escenario donde el error de EGR se devuelve a un valor normal pese a declarar P0401
- **WHEN** se ejecuta el test de coherencia
- **THEN** falla, señalando qué avería no está respaldada por sus lecturas

#### Scenario: El test no replica los valores esperados
- **GIVEN** el test de coherencia
- **WHEN** obtiene los valores a comprobar
- **THEN** extrae las tramas crudas del escenario y las decodifica con las fórmulas SAE J1979 reales
- **AND** comprueba rangos derivados de cada avería, sin copiar los valores esperados del propio fichero
- **AND** no requiere que los emuladores Docker estén levantados, para poder correr en CI

---

### Requirement: Alineación del catálogo de escenarios
El sistema SHALL mantener los `sensorValues` del catálogo de escenarios alineados con lo que responde el emulador.

#### Scenario: Coincidencia entre catálogo y emulador
- **GIVEN** un escenario del catálogo en `composition.ts`
- **WHEN** se comparan sus `sensorValues` con la respuesta del emulador para los mismos PIDs
- **THEN** coinciden

#### Scenario: Máscaras de PIDs soportados
- **GIVEN** un escenario al que se añaden PIDs
- **WHEN** se consultan sus máscaras de PIDs soportados
- **THEN** declaran exactamente los PIDs a los que el escenario responde
