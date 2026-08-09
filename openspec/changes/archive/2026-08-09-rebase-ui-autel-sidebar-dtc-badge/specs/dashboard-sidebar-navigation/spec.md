## Purpose

Define el layout de navegación del dashboard de diagnóstico: un sidebar de secciones que sustituye la pantalla apilada única, y el indicador visual de averías activas que compensa que las secciones ya no se ven todas a la vez.

## ADDED Requirements

### Requirement: Navegación del dashboard por secciones en sidebar
El sistema SHALL presentar el dashboard autenticado como un layout de dos columnas: un sidebar de navegación fijo a la izquierda con un icono por sección (Vehículo, Datos Vivo, Códigos DTC, Freeze Frame, Unidades Control, Diagnóstico, Chat IA, Informe) y un área de contenido a la derecha que renderiza solo la sección activa.

#### Scenario: Cambiar de sección no pierde el estado del vehículo activo
- **GIVEN** un vehículo ya identificado y confirmado, con un diagnóstico en curso o completado
- **WHEN** el usuario hace click en un icono del sidebar distinto al activo
- **THEN** el área de contenido cambia a la sección seleccionada
- **AND** el vehículo seleccionado, el resultado del diagnóstico y el estado de streaming de telemetría no se reinician

#### Scenario: Acceso al panel de administración sigue disponible para usuarios admin
- **GIVEN** un usuario autenticado con `isAdmin: true`
- **WHEN** visualiza el dashboard con el layout de sidebar
- **THEN** existe un control visible (en el sidebar o en la cabecera) que navega a `/admin`
- **AND** para un usuario sin `isAdmin` ese control no se muestra

### Requirement: Badge de DTC activos en el icono de sección "Códigos DTC"
El sistema SHALL mostrar, sobre el icono de la sección "Códigos DTC" del sidebar, un badge numérico con el recuento de códigos DTC activos del último diagnóstico, para que el mecánico detecte averías sin necesidad de entrar a esa sección.

#### Scenario: Sin diagnóstico todavía, no se muestra badge
- **GIVEN** un vehículo confirmado sin ningún diagnóstico ejecutado aún
- **WHEN** se renderiza el sidebar
- **THEN** el icono "Códigos DTC" no muestra badge

#### Scenario: Diagnóstico sin DTCs, no se muestra badge
- **GIVEN** un diagnóstico completado cuyo resultado no contiene códigos DTC
- **WHEN** se renderiza el sidebar
- **THEN** el icono "Códigos DTC" no muestra badge

#### Scenario: Diagnóstico con DTCs activos, se muestra el recuento
- **GIVEN** un diagnóstico completado cuyo resultado contiene N códigos DTC (N > 0)
- **WHEN** se renderiza el sidebar
- **THEN** el icono "Códigos DTC" muestra un badge con el valor N

#### Scenario: El badge se actualiza al re-ejecutar el diagnóstico
- **GIVEN** un badge visible con un recuento N de un diagnóstico previo
- **WHEN** el usuario ejecuta un nuevo diagnóstico que resuelve con M códigos DTC (M != N)
- **THEN** el badge pasa a mostrar M
- **AND** si M es 0, el badge deja de mostrarse

#### Scenario: El badge se limpia al cambiar de vehículo
- **GIVEN** un badge visible con un recuento N para el vehículo activo
- **WHEN** el usuario selecciona un vehículo distinto y aún no se ha ejecutado un diagnóstico para él
- **THEN** el badge no muestra el recuento N del vehículo anterior
