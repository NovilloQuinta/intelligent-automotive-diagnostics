# Live Telemetry

## Purpose

Mostrar en los indicadores del dashboard valores leídos del vehículo conectado — emulador o coche real — con una cadencia que el transporte ELM327 pueda sostener, y degradando por PID cuando una lectura falla.

## ADDED Requirements

### Requirement: Los indicadores muestran lecturas reales del vehículo
El sistema SHALL obtener los valores de los indicadores leyendo PIDs del vehículo conectado, y NEVER generarlos a partir de constantes locales.

#### Scenario: Vehículo conectado
- **WHEN** hay un vehículo seleccionado y confirmado
- **THEN** los indicadores muestran RPM, temperatura de refrigerante, velocidad y temperatura de admisión leídos del vehículo

#### Scenario: Coherencia con el diagnóstico
- **WHEN** se ejecuta un diagnóstico sobre el vehículo mostrado
- **THEN** los valores de la tabla de PIDs son coherentes con los de los indicadores, salvo la variación real del vehículo entre ambas lecturas

---

### Requirement: Cadencia acotada por el coste del transporte
El sistema SHALL limitar la frecuencia de refresco a una lectura por segundo como máximo.

#### Scenario: Refresco periódico
- **WHEN** el dashboard está activo con un vehículo seleccionado
- **THEN** se solicita una lectura por segundo

#### Scenario: Lectura más lenta que el intervalo
- **WHEN** un ciclo de lectura tarda más que el intervalo configurado
- **THEN** no se acumulan peticiones solapadas sobre la misma conexión

---

### Requirement: Degradación por PID ante fallos de lectura
El sistema SHALL tolerar el fallo de PIDs individuales sin perder el resto de la telemetría.

#### Scenario: Un PID no soportado
- **WHEN** el vehículo no responde a uno de los cuatro PIDs
- **THEN** ese indicador muestra ausencia de valor
- **AND** los otros tres siguen actualizándose

#### Scenario: Pérdida de conexión con el vehículo
- **WHEN** la lectura falla por completo
- **THEN** el indicador de estado deja de señalar transmisión en vivo
- **AND** la telemetría se reanuda automáticamente al restablecerse la conexión
