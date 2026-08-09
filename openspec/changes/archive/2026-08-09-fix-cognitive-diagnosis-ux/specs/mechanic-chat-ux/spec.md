# Mechanic Chat UX

## Purpose

El diagnóstico cognitivo (chat mecánico) deja de tragar sus propios errores en el frontend y expone un único contenedor con scroll, para que un fallo real (timeout, demasiados pasos del LLM, error inesperado) se vea como tal en vez de parecer que la app se ha colgado.

## Requirements

### Requirement: `useCognitiveDiagnosis` expone el error real

El sistema SHALL exponer desde `useCognitiveDiagnosis` un estado `error: { message: string; kind: "timeout" | "unavailable" | "too_many_steps" | "unknown" } | null`, derivado del fallo real de la petición, en vez de descartarlo en silencio.

#### Scenario: Fallo por timeout del LLM
- **GIVEN** la API responde 504 al pedir el diagnóstico cognitivo
- **WHEN** se dispara `trigger()`
- **THEN** `error.kind` es `"timeout"`
- **AND** `error.message` es el mensaje recibido del backend

#### Scenario: Fallo por demasiadas iteraciones de tool calling
- **GIVEN** la API responde con el status 4xx específico de "demasiados pasos"
- **WHEN** se dispara `trigger()`
- **THEN** `error.kind` es `"too_many_steps"`
- **AND** `error.message` es accionable (indica reformular la pregunta)

#### Scenario: Diagnóstico cognitivo no disponible
- **GIVEN** la API responde 404 (sin `llmClient` configurado)
- **WHEN** se dispara `trigger()`
- **THEN** `error.kind` es `"unavailable"`

#### Scenario: Error inesperado
- **GIVEN** la petición falla con un error que no es `ApiHttpError` o con un status no contemplado
- **WHEN** se dispara `trigger()`
- **THEN** `error.kind` es `"unknown"` y `error.message` no queda vacío

#### Scenario: Un nuevo intento limpia el error anterior
- **GIVEN** un `error` previo en el estado
- **WHEN** se dispara `trigger()` de nuevo
- **THEN** `error` vuelve a `null` mientras la nueva petición está en curso

#### Scenario: Éxito no dejar rastro de un error previo
- **GIVEN** un `error` previo en el estado
- **WHEN** el nuevo `trigger()` resuelve con éxito
- **THEN** `error` es `null` en el estado final

---

### Requirement: El error cognitivo es visible en el chat

El sistema SHALL mostrar en `MechanicChat` el `error` expuesto por el hook, de forma visible dentro del hilo de conversación, en vez de dejar el chat sin respuesta.

#### Scenario: Se muestra el mensaje de error
- **GIVEN** `error` no es `null`
- **WHEN** se renderiza `MechanicChat`
- **THEN** se muestra el `error.message` de forma visible en el hilo
- **AND** no se muestra ningún estado de carga simultáneo

#### Scenario: Sin error, el chat no cambia
- **GIVEN** `error` es `null`
- **WHEN** se renderiza `MechanicChat`
- **THEN** no aparece ningún mensaje de error

---

### Requirement: La tabla de PIDs distingue error de espera vacía

El sistema SHALL distinguir en `PidsTable`, cuando la búsqueda de PIDs adicionales por IA termina, entre "sin resultados" (sin error) y "falló" (con error), en vez de dejar desaparecer el indicador de carga sin explicación.

#### Scenario: La búsqueda de PIDs falla
- **GIVEN** `aiLoading` pasa a `false` y hay un `aiError` no nulo
- **WHEN** se renderiza `PidsTable`
- **THEN** se muestra un aviso breve indicando que la búsqueda de PIDs adicionales falló, en vez de no mostrar nada

#### Scenario: La búsqueda de PIDs termina sin resultados, sin error
- **GIVEN** `aiLoading` pasa a `false`, `aiRows` está vacío y no hay error
- **WHEN** se renderiza `PidsTable`
- **THEN** no se muestra ningún aviso de error (comportamiento actual sin cambios)

---

### Requirement: Un único contenedor con scroll en la sección de chat

El sistema SHALL usar un único contenedor con scroll para el hilo de mensajes de la sección de chat: `<main>` en `DashboardLayout`. `MechanicChat` no SHALL limitar la altura de su hilo de mensajes con su propio scroll interno.

#### Scenario: El hilo de mensajes no tiene scroll propio
- **GIVEN** `MechanicChat` con un hilo de conversación largo
- **WHEN** se inspecciona el contenedor del hilo de mensajes
- **THEN** no tiene una clase de altura máxima con scroll propio (`overflow-y-auto` acoplado a un `max-h-*`)

#### Scenario: `<main>` sigue siendo scrollable
- **GIVEN** la sección de chat activa con un hilo largo
- **WHEN** el contenido excede el alto visible
- **THEN** el scroll ocurre en `<main>` de `DashboardLayout`, no en un contenedor anidado
