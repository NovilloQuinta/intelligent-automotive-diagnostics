# Diagnosis Chat

## Purpose

Unifica el diagnóstico asistido por IA en un único apartado "Diagnóstico" (el chat), donde el mecánico lanza la IA a demanda, recibe el diagnóstico del LLM como primer mensaje y puede hacer preguntas de seguimiento en el mismo contexto, en lugar de tener un panel determinista separado y un chat desconectado.

## Requirements

### Requirement: Un único apartado "Diagnóstico"

El sistema SHALL exponer un único apartado "Diagnóstico" en el sidebar que agrupa el diagnóstico asistido por IA y su conversación. El sistema SHALL eliminar el apartado "Diagnóstico IA" separado que mostraba un texto determinista, así como el apartado "Chat IA" independiente.

#### Scenario: El sidebar tiene un solo apartado de diagnóstico
- **GIVEN** el dashboard cargado con un vehículo seleccionado
- **WHEN** se inspecciona el sidebar
- **THEN** existe exactamente un apartado "Diagnóstico"
- **AND** no existen apartados separados "Diagnóstico IA" ni "Chat IA"

#### Scenario: El apartado "Diagnóstico" renderiza el chat
- **WHEN** el usuario abre el apartado "Diagnóstico"
- **THEN** se renderiza la interfaz de chat (no un panel de texto determinista)

### Requirement: Diagnóstico IA a demanda

El sistema SHALL lanzar el diagnóstico de IA únicamente cuando el mecánico lo solicita de forma explícita. El sistema SHALL NOT disparar el diagnóstico de IA automáticamente al entrar al dashboard o al confirmar un vehículo.

#### Scenario: No se lanza al entrar al vehículo
- **GIVEN** el mecánico selecciona/confirma un vehículo
- **WHEN** el dashboard termina de cargar
- **THEN** no se emite ninguna petición de diagnóstico cognitivo
- **AND** el apartado "Diagnóstico" permanece en estado vacío

#### Scenario: El mecánico lanza la IA desde el CTA
- **GIVEN** el apartado "Diagnóstico" en estado vacío con datos disponibles
- **WHEN** el mecánico pulsa "Lanzar diagnóstico IA"
- **THEN** se emite la petición de diagnóstico cognitivo
- **AND** el apartado pasa a estado generando

#### Scenario: La recogida de fallos crudos no dispara la IA
- **GIVEN** el mecánico pulsa "Iniciar diagnóstico" (recogida de fallos crudos: DTCs, datos en vivo)
- **WHEN** se completa la recogida
- **THEN** no se lanza automáticamente el diagnóstico de IA

### Requirement: Tres estados del apartado "Diagnóstico"

El sistema SHALL presentar el apartado "Diagnóstico" en exactamente uno de tres estados: vacío, generando o diagnóstico.

#### Scenario: Estado vacío con CTA y contexto
- **GIVEN** no hay conversación ni diagnóstico en curso
- **WHEN** se renderiza el apartado "Diagnóstico"
- **THEN** se muestra el CTA "Lanzar diagnóstico IA"
- **AND** se muestra una línea de contexto describiendo qué analizará la IA

#### Scenario: Estado generando con spinner
- **GIVEN** una petición de diagnóstico cognitivo en curso
- **WHEN** se renderiza el apartado "Diagnóstico"
- **THEN** se muestra un spinner con texto descriptivo del proceso
- **AND** no se muestra el input de follow-up como editable mientras no haya resultado

#### Scenario: Estado diagnóstico con primer mensaje y follow-up
- **GIVEN** un diagnóstico cognitivo completado con éxito
- **WHEN** se renderiza el apartado "Diagnóstico"
- **THEN** el output del LLM aparece como primer mensaje del chat
- **AND** se muestra un input para escribir preguntas de seguimiento

### Requirement: Follow-up en el mismo contexto

El sistema SHALL permitir al mecánico continuar la conversación tras el diagnóstico, enviando las preguntas de seguimiento con el mismo contexto de la sesión de diagnóstico iniciada.

#### Scenario: Pregunta de seguimiento encadenada a la misma sesión
- **GIVEN** un diagnóstico completado en una sesión
- **WHEN** el mecánico escribe una pregunta y la envía
- **THEN** la pregunta se envía vinculada a la misma sesión de diagnóstico
- **AND** la respuesta aparece como un mensaje más del chat

### Requirement: Regeneración por sesión nueva

El sistema SHALL regenerar el diagnóstico completo en una sesión nueva cuando el mecánico solicita un nuevo diagnóstico. El diagnóstico y la conversación anteriores SHALL quedar persistidos ligados a su sesión y accesibles en el historial.

#### Scenario: Nuevo diagnóstico regenera en sesión nueva
- **GIVEN** un diagnóstico previo en una sesión cerrada
- **WHEN** el mecánico lanza un nuevo diagnóstico
- **THEN** se crea una sesión de diagnóstico nueva con el contexto actual
- **AND** el diagnóstico previo no se reutiliza ni se mezcla con el nuevo hilo

#### Scenario: El diagnóstico anterior queda accesible en el historial
- **GIVEN** una sesión de diagnóstico previa con su conversación persistida
- **WHEN** el mecánico abre el historial de diagnósticos
- **THEN** la sesión previa aparece listada con su severidad y momento
- **AND** su contenido (diagnóstico y conversación) es recuperable desde el detalle

### Requirement: Casos borde del lanzamiento

El sistema SHALL gestionar los casos borde del lanzamiento del diagnóstico: sin DTCs activos se permite lanzar igual (el LLM entrega un resumen de salud); sin datos de sesión todavía, el CTA queda deshabilitado.

#### Scenario: Sin DTCs activos se permite lanzar
- **GIVEN** un vehículo sin DTCs activos pero con sesión de datos disponible
- **WHEN** el mecánico pulsa "Lanzar diagnóstico IA"
- **THEN** el lanzamiento está habilitado
- **AND** la IA entrega un resumen de salud (no un error por ausencia de fallos)

#### Scenario: Sin datos aún, CTA deshabilitado
- **GIVEN** el vehículo seleccionado sin datos de diagnóstico recogidos todavía
- **WHEN** se renderiza el apartado "Diagnóstico"
- **THEN** el CTA "Lanzar diagnóstico IA" aparece deshabilitado
