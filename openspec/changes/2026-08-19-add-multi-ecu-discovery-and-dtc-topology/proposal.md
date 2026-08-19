## Why

El descubrimiento de ECUs ya está construido y no se puede enseñar. `ecuDiscovery.ts`
hace exactamente lo que hace una máquina de taller al enchufarse: pone headers ON
(`AT H1`), se dirige a la dirección funcional de broadcast (`AT SH 7DF`), lanza un
`01 00` y parsea el header CAN de cada ECU que conteste. `parseCanHeaders` recoge
múltiples respondedores deduplicados, y `TopologyMapPanel` pinta el bus.

**El problema es que no hay a quién preguntar.** Las 474 líneas del escenario Audi del
emulador responden todas desde `ECU_R_ADDR_E` (7E8, el motor): 38 usos de esa dirección
y cero de cualquier otra. El broadcast devuelve un respondedor y el mapa dibuja un nodo.
La función está terminada y no tiene nada que mostrar.

Hay dos huecos más, del mismo hilo:

- **El agente no aprende ECUs.** El system prompt tiene bloques explícitos para cuando
  descubre un PID desconocido y para cuando descubre un DTC desconocido, pero **ninguno
  para ECUs**. Resultado: `get_ecu_info`, `search_similar_ecus` e `index_ecu` no se
  nombran en el prompt, y la tabla `ecu_definitions` con su índice vectorial existen,
  están testeadas y en la práctica se quedan vacías.
- **No se sabe qué ECU reporta cada avería.** `fetchDtcCodes` emite el Mode 03 con los
  headers apagados —el scan los restaura a `AT H0` al terminar— y `parseDtcResponse`
  devuelve pares de bytes pelados. `DtcCode` no tiene origen, así que el mapa de
  topología no puede marcar dónde está el fallo, que es justo lo que hace una máquina de
  taller y lo que da valor al mapa.

## What Changes

- **El escenario Audi responde desde cinco ECUs.** El emulador soporta respuestas
  multi-header: un `Response` es una concatenación de bloques `HD(dirección) + SZ + DT`
  y se pueden encadenar bloques de direcciones distintas (su propio escenario `car` lo
  hace). Se usan las cinco que caen en el rango legislado ISO 15765-4 que `protocol.ts`
  acepta: motor (7E8), transmisión (7E9), control híbrido (7EA), batería de tracción
  (7EB) y powertrain (7ED).
- **Las ECUs nuevas se quedan sin nombre a propósito.** `ecuAddressCatalog` solo tiene
  estandarizada `7E8` = Engine Control Module; el resto sale como "ECU 7E9", tipo
  desconocido. Sembrar los nombres cortocircuitaría justo lo que el proyecto quiere
  demostrar: que el catálogo aprende.
- **Bloque de aprendizaje de ECUs en el system prompt**, simétrico a los de PID y DTC,
  para que la cadena `get_ecu_info` → `search_similar_ecus` → `index_ecu` se ejercite y
  `ecu_definitions` se llene con lo que el agente resuelve.
- **Cada DTC se atribuye a la ECU que lo reporta**, leyendo el Mode 03 con `AT H1`, y el
  nodo correspondiente del mapa de topología lo marca.

## Non-goals

- **No se siembran nombres de ECU** en `ecuAddressCatalog` (ver arriba).
- **No se unifican** las ECUs fuera del rango legislado (ABS en 7B0/7B8, A/C en
  7C4/7CC): `protocol.ts` las filtra correctamente y ampliar el rango es otra decisión.
- **No se toca `createReliableTransport`**: es el transporte que habla con el coche real.

## Capabilities

### Added Capabilities
- `multi-ecu-discovery`: el mecánico enchufa y ve todas las ECUs del bus, no solo el
  motor; las que el sistema no conoce las identifica y aprende el agente; y el mapa
  marca en qué ECU está cada avería.

## Dependencies

Ninguna. Se basa en `develop` tal cual (`a9ada00`).

## Impact

- **Aditivo, sin TypeScript**: `docker/elm327/scenarios/audi_a3_tdi.py` — las respuestas
  multi-header. Es la parte de riesgo cero: no cambia ninguna respuesta existente.
- **Comportamiento del LLM**: `apps/core-api/src/application/prompts/cognitiveDiagnosisPrompt.ts`.
  **Requiere `pnpm eval:agent` con la clave del usuario para validarse** — y el grupo A
  entero, no solo B-E, porque un bloque nuevo puede volver al agente más verboso.
- **Dominio → UI**: `domain/entities/dtcCode.ts`, `infrastructure/elm327/elm327Adapter.ts`
  y `protocol.ts`, el DTO de respuesta y `apps/ui/src/components/dashboard/TopologyMapPanel.tsx`.
