# Diagnosis Session State

## Purpose

Garantizar que todo dato de diagnóstico visible en el dashboard pertenece al vehículo actualmente seleccionado, en cualquier instante, incluida la transición entre vehículos.

## ADDED Requirements

### Requirement: El estado de diagnóstico se descarta al cambiar de vehículo
El sistema SHALL descartar el resultado de diagnóstico, las filas descubiertas por el LLM y el DTC seleccionado cuando cambia el vehículo activo.

#### Scenario: Cambio de vehículo con diagnóstico en pantalla
- **WHEN** hay un diagnóstico visible de un vehículo y el usuario confirma otro vehículo distinto
- **THEN** los paneles de DTC, PIDs y diagnóstico vuelven a su estado vacío
- **AND** ningún código, valor ni texto del vehículo anterior permanece visible

#### Scenario: Vuelta al vehículo anterior
- **WHEN** el usuario vuelve a seleccionar un vehículo ya diagnosticado en esta sesión
- **THEN** no se muestran datos obsoletos como si fueran actuales

---

### Requirement: Una respuesta en vuelo nunca se aplica a otro vehículo
El sistema SHALL descartar cualquier respuesta pendiente cuyo vehículo de origen no sea el seleccionado en el momento de resolverse.

#### Scenario: Diagnóstico en curso y cambio de vehículo
- **WHEN** hay una petición de diagnóstico en vuelo y el usuario cambia de vehículo antes de que resuelva
- **THEN** el resultado que llega no se pinta bajo el vehículo nuevo

#### Scenario: Diagnóstico cognitivo en curso
- **WHEN** el diagnóstico cognitivo (hasta 60 s) sigue en curso y el usuario cambia de vehículo
- **THEN** sus filas de PIDs no aparecen en la tabla del vehículo nuevo
