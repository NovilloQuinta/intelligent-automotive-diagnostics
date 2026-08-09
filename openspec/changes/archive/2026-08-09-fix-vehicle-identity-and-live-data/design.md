## Context

Rama `fix/vehicle-identity-and-live-data`, creada desde `develop`. Fase 4. Stack: TypeScript ESM strict, Clean Architecture, Vitest (backend) + React 19 / TanStack / Testing Library (UI).

Origen: prueba manual de la UI del 8 agosto 2026, no una spec previa. Los cinco defectos se documentan en `proposal.md` con su fichero y línea.

**Restricción externa que condiciona el diseño**: la semana del 10 agosto 2026 se conecta un coche real por ELM327 (`OBD_MODE=tcp`) y hay que seguir pudiendo demostrar todo contra el emulador Docker. Los dos modos difieren en algo que atraviesa este cambio entero: en modo `docker` existe un `ScenarioDescriptor` por vehículo con marca, modelo, año y motor; en modo `tcp` **no hay descriptor**, solo el escenario sintético `TCP_DIRECT_SCENARIO` (`diagnosisService.ts:52`). Todo lo que se diseñe aquí tiene que dar una respuesta correcta en los dos modos, y "correcta" no significa "la misma".

## Goals / Non-Goals

**Goals:**
- El vehículo que muestra el wizard es el que hay conectado, con los datos que realmente se conocen de él.
- Ningún panel muestra datos de un vehículo distinto del seleccionado, en ningún instante.
- Los DTC llegan con descripción verificable, o sin descripción — nunca con una inventada.
- El freeze frame dice algo útil sobre el DTC concreto que se seleccionó.
- Los gauges y la tabla de PIDs muestran el mismo vehículo con las mismas magnitudes.
- Todo lo anterior funciona contra el emulador y contra un ELM327 real sin cambiar código.

**Non-Goals:**
- No se implementa descubrimiento real de ECUs — `getEcuInfo` sigue devolviendo la ECU fija (`elm327Adapter.ts:147`). Es un defecto conocido, pero exige Mode 09 PID 0A y barrido de direcciones CAN: cambio propio.
- No se pobla el índice vectorial de DTCs — eso es `add-knowledge-mcp-tools`. Aquí solo se crea el catálogo estático del que ese cambio partirá.
- No se cachea la telemetría en servidor ni se hace streaming SSE — polling simple; si la carga lo justifica, se optimiza con datos delante.
- No se rediseña el wizard ni la disposición del dashboard.
- No se añade histórico de sesiones de diagnóstico.

## Decisions

### 1. La identidad del vehículo se compone, no se elige

La alternativa evidente era devolver directamente `ScenarioDescriptor.vehicleInfo` en modo docker — un `return` y listo. Se descarta: convertiría el wizard en una animación decorativa sobre un dato constante, y el "Leyendo VIN · Modo 09 PID 02" de la pantalla sería literalmente falso. La demo del TFM se apoya en que ese paso es una lectura real.

Se compone:

| Campo | Origen en modo `docker` | Origen en modo `tcp` |
|---|---|---|
| `vin` | **siempre** el leído del ECU | leído del ECU |
| `make`, `model`, `year`, `engineType` | `ScenarioDescriptor` | deducido del WMI / `unknown` |
| `manufacturer`, `region`, `modelYearDecoded` | decodificados del VIN leído | decodificados del VIN leído |

Consecuencia buscada: si el emulador devuelve un VIN que no corresponde al escenario, se ve. El VIN leído y los metadatos del catálogo son dos fuentes independientes y la pantalla las muestra juntas — una discrepancia es información de diagnóstico, no un bug a esconder.

La fusión vive en `DiagnosisService.getVehicleInfo`, no en el adaptador: el adaptador habla con una centralita y no debe saber que existen escenarios. `resolveRepository` ya localiza el descriptor; se añade un `resolveDescriptor` simétrico.

### 2. Un VIN ilegible es un estado, no un error

Hoy el `catch` de `getVehicleInfo` (`elm327Adapter.ts:131`) colapsa dos situaciones distintas en la misma respuesta: "el ECU no contestó a `09 02`" y "el ECU contestó algo que no es un VIN válido". Ambas acaban en `FALLBACK_VIN` con todo a `unknown`, y `decodeVin` las vuelve a colapsar (`diagnosisService.ts:229`) devolviendo `UNDECODED_VIN`.

Con un coche real la diferencia importa: un ECU que no soporta `09 02` es normal en vehículos anteriores a ~2005, y un VIN corrupto apunta a problema de transporte o de parseo multi-frame. `VehicleInfoOutput` gana un campo discriminante (`vinStatus: 'read' | 'unsupported' | 'unreadable'`) y el wizard lo muestra con el texto adecuado en vez del genérico "VIN no decodificable".

### 3. Catálogo DTC estático en dominio, sin inventar descripciones

`domain/dtcCatalog.ts`, mismo patrón que `seed-pids.ts`: dato estático, sin I/O, sin dependencias. Cobertura mínima: P0301, P0401, P2002 (los de los escenarios) más los genéricos P0xxx habituales que un coche real puede soltar en la demo.

La regla dura: **un código ausente del catálogo se entrega con `description: ''`**. Ni derivar de la familia del código ("P03xx → fallo de encendido genérico"), ni texto de relleno. El sistema entero está construido sobre la distinción entre conocimiento verificado y conocimiento por validar (`confidenceScale.ts`, `validated: false`); una descripción plausible sin fuente rompe esa distinción justo donde más se ve, y la UI ya renderiza correctamente la descripción vacía.

Se descarta meterlo en SQLite como los PIDs: los PIDs necesitan persistencia porque el LLM descubre PIDs nuevos y los indexa. Las descripciones DTC de este catálogo son constantes de norma; el descubrimiento de DTCs desconocidos ya tiene su camino en `dtcsIndex` + `ValidateDiscoveredDtcUseCase`.

### 4. Freeze frame: multi-PID con degradación por PID

```
02 04  Carga calculada
02 05  Temperatura de refrigerante
02 0C  RPM
02 0D  Velocidad
02 11  Posición de mariposa
```

Lecturas secuenciales sobre la misma conexión, cada una con su `try`: un `NO DATA` o un `7F` en un PID lo omite del frame y no tumba el resto. Contra un coche real esto no es defensivo, es lo normal — pocos vehículos soportan el conjunto completo.

El frame se devuelve `null` solo si **ningún** PID respondió, que es el criterio actual de "no hay freeze frame".

El `dtc` deja de ser una etiqueta: se usa para seleccionar el frame en la trama Mode 02. Cuando se pide sin `dtc` (el caso de `ProcessVehicleDiagnosisUseCase`, que lo llama sin argumento) se lee el frame 0 y se etiqueta con el DTC que el propio frame reporta si está disponible; `'UNKNOWN'` solo si no lo está.

### 5. Telemetría: polling a 1 Hz desde el cliente, no SSE

Tres opciones consideradas:

1. **SSE desde el servidor** — es lo que hubo antes (el TSDoc de `useLiveTelemetry` menciona "the old SSE-based fake stream"). Mantiene una conexión por cliente y complica el rate limiting; para 4 PIDs a 1 Hz no aporta.
2. **Polling desde el cliente** — elegida. Un `GET` por segundo, cancelable, trivial de probar, y TanStack Query ya da `refetchInterval` con cancelación y deduplicación.
3. **Push desde el adaptador con caché en servidor** — la única que escala a varios clientes sobre un mismo vehículo, pero introduce estado compartido y un ciclo de vida nuevo. Fuera de alcance para un TFM con un usuario por vehículo.

**La cadencia baja de 2 Hz a 1 Hz** y esto es una decisión, no un ajuste. El transporte ELM327 serializa todos los comandos en una única conexión TCP con cola FIFO (`elm327Adapter.ts:36`). Un ciclo son 4 lecturas secuenciales; contra el emulador Docker es instantáneo, contra un ELM327 real por Bluetooth/WiFi cada comando cuesta ~50-100 ms, así que el ciclo entero ronda 200-400 ms. A 2 Hz el margen desaparece en cuanto el enlace tiene un mal momento y las peticiones se solapan sobre la misma cola. 1 Hz deja el doble de margen y sigue leyéndose como tiempo real.

La constante va con TSDoc explicando esto: sin la explicación, el primer refactor que "optimice" la UI la volverá a subir.

### 6. TanStack Query en lugar de `useState` manual

`useDiagnosis` y `useCognitiveDiagnosis` reimplementan a mano lo que Query ya hace: estado de carga, descarte de respuestas obsoletas (`useVehicleAutoDetect` llega a mantener un `useRef` de request id para eso), y limpieza al cambiar de clave — que es justo lo que falta y causa el defecto 2.

Con `queryKey: ['diagnosis', selectedId]` el bug desaparece por construcción: cambiar de vehículo cambia la clave, y Query no sirve datos de otra clave. La alternativa mínima (`key={selectedId}` en el JSX para forzar remontaje) arregla el síntoma sin quitar el estado manual, y deja el mismo agujero abierto para el siguiente hook que se añada.

El diagnóstico no es una query automática sino una mutación disparada por botón: se modela como `useMutation` cuyo resultado se escribe en la caché bajo la `queryKey` del escenario, para que el cambio de vehículo lo invalide igual.

## Risks / Trade-offs

- **El VIN multi-frame contra un coche real.** `parseVinResponse` está probado contra el emulador. En CAN real la respuesta a `09 02` llega en varias tramas ISO-TP y el ELM327 las presenta con prefijos de línea (`0:`, `1:`, `2:`) que el emulador puede no reproducir. Mitigación: test con una trama multi-frame real capturada, antes del lunes. Si falla, el `vinStatus: 'unreadable'` de la Decisión 2 deja la app usable mientras se arregla.
- **1 Hz puede seguir siendo agresivo** para un ELM327 clónico barato. Mitigación: el intervalo es una constante única; subirlo a 2 s es un cambio de una línea. Se medirá en la sesión con el coche y se anotará el resultado.
- **Eliminar el jitter quita suavidad visual**: los gauges pasarán de moverse continuamente a saltar una vez por segundo. Es el precio de que el número sea verdad. Si molesta, la solución es interpolar en el render entre lecturas reales, nunca reintroducir valores inventados.
- **El catálogo DTC estático envejece.** Es un subconjunto escrito a mano; un coche real puede soltar códigos fuera de él y aparecerán sin descripción. Aceptado explícitamente: es el caso que justifica el RAG del bloque siguiente, y verlo vacío en la demo es más honesto que rellenarlo.
- **Alcance amplio para un solo change** (backend, emulador y UI). Se acepta porque los cinco defectos comparten causa o consumidor y porque la fecha del coche real no admite encadenar tres cambios. Las tareas están ordenadas para que cada fase quede en verde por separado.

## Migration Plan

Sin migración de datos. Orden de implementación por dependencia:

1. Emulador (Mode 09, Mode 02) — sin él, los tests de integración de las fases 2 y 5 no tienen contra qué correr.
2. Backend: identidad, catálogo DTC, freeze frame, endpoint de telemetría.
3. UI: TanStack Query, gauges contra el endpoint nuevo, borrado del jitter.

Verificación contra el coche real es la última tarea y se hace con `OBD_MODE=tcp`, sin tocar código.

## Open Questions

- ¿El wizard debe permitir continuar con `vinStatus: 'unsupported'`? Hoy el error bloquea el paso. Contra un coche antiguo eso dejaría la app inutilizable. Propuesta: permitir continuar con aviso visible, decidir al probar.
- ¿Qué VIN se usa para el coche real en la memoria del TFM? Es un dato personal identificable del vehículo; probablemente haya que ofuscarlo en las capturas.
