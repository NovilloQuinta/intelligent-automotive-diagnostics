# Freeze Frame Capture

## Purpose

Devolver el congelado de datos asociado al DTC concreto que lo disparó, con suficientes PIDs para ser diagnósticamente útil, degradando por PID cuando el vehículo no soporta todos.

## ADDED Requirements

### Requirement: Freeze frame multi-PID
El sistema SHALL leer el conjunto de PIDs Mode 02 relevantes (carga calculada, temperatura de refrigerante, RPM, velocidad y posición de mariposa) en lugar de un único PID.

#### Scenario: Vehículo que soporta todos los PIDs
- **WHEN** se pide el freeze frame de un DTC y el vehículo responde a los cinco PIDs
- **THEN** el frame contiene los cinco valores con sus unidades

#### Scenario: Vehículo con soporte parcial
- **WHEN** uno de los PIDs responde `NO DATA` o error
- **THEN** ese PID se omite del frame
- **AND** los PIDs que sí respondieron se conservan

#### Scenario: Sin ningún dato congelado
- **WHEN** ningún PID Mode 02 responde
- **THEN** el freeze frame es `null`
- **AND** el panel indica ausencia de congelado, no un error

---

### Requirement: El freeze frame corresponde al DTC solicitado
El sistema SHALL usar el DTC recibido para seleccionar el frame leído, y NEVER limitarse a etiquetar con él un frame genérico.

#### Scenario: Dos DTC con congelados distintos
- **WHEN** el usuario selecciona `P0301` y después `P0401` en un vehículo con ambos códigos
- **THEN** los valores mostrados difieren entre uno y otro

#### Scenario: Petición sin DTC
- **WHEN** se pide el freeze frame sin indicar código (diagnóstico determinista)
- **THEN** se lee el primer frame disponible
- **AND** se etiqueta con el DTC que el propio frame reporta, o como desconocido si no lo reporta
