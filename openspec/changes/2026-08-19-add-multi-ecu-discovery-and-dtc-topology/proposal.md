## Why

El descubrimiento de ECUs ya está construido y no se puede enseñar. `ecuDiscovery.ts`
hace exactamente lo que hace una máquina de taller al enchufarse: pone headers ON
(`AT H1`), se dirige a la dirección funcional de broadcast (`AT SH 7DF`), lanza un
`01 00` y parsea el header CAN de cada ECU que conteste. `parseCanHeaders` recoge
múltiples respondedores deduplicados, y `TopologyMapPanel` pinta el bus.

**El problema es que el broadcast no llega a nadie.** El emulador filtra sus entradas
por header (`elm.py:2081`): si una entrada declara `Header` y el header activo es otro,
la salta. La entrada `01 00` del escenario Audi declara `Header: ECU_ADDR_E` (`7E0`) y el
barrido pregunta con `AT SH 7DF`, así que **no casa ninguna entrada y la petición se queda
sin respuesta**. `discoverEcus` cae entonces a su fallback `discoverPrimaryEcu`
(addressing físico + Mode 09 0A) y devuelve un único ECM: el mapa dibuja un nodo.

La función está terminada y no tiene nada que mostrar. Y como los dos caminos están
separados por header, la solución es puramente aditiva (ver D1).

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

- **El escenario Audi responde al broadcast desde dos ECUs.** Se **añade** una entrada
  nueva para `01 00` con `Header: "7DF"`; la existente (`Header: ECU_ADDR_E`, la que sirve
  a `getSupportedPids()`) no se toca. Su `Response` encadena bloques
  `HD(dirección) + SZ + DT` de direcciones distintas, como hace el escenario `car` del
  propio emulador. Son las dos únicas con evidencia real: motor (7E8, estandarizada por
  ISO 15765-4/SAE J1979) y transmisión (7E9, confirmada con tráfico CAN real de la
  plataforma MQB — ver `docs/deuda-conocida.md`, revisión del 31/08/2026).
  **Corrección del 31/08/2026**: esta propuesta listaba originalmente cinco direcciones
  (motor, transmisión, "control híbrido" 7EA, "batería de tracción" 7EB y "powertrain"
  7ED). Las tres últimas no tenían ninguna fuente real detrás y eran además incoherentes
  con el vehículo emulado (un Audi A3 2.0 TDI 100% diésel, sin componente híbrido). Se
  retiraron del escenario: en un VAG real esos módulos no responden al broadcast
  genérico de 11 bits, viven detrás de la pasarela propietaria (VCDS).
- **`7E9` sale con nombre real, no sin nombre.** `ecuAddressCatalog` (código) sigue
  estandarizando solo `7E8`, pero `ecu_definitions` (BD) ahora nace con un seed mínimo
  para `7E9` = "Caja de cambios" (fuente real verificada, no una suposición). El resto
  de direcciones no estandarizadas sigue sin sembrar a propósito — sembrar sin evidencia
  cortocircuitaría lo que el proyecto quiere demostrar: que el catálogo aprende.
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

- **Aditivo, sin TypeScript**: `docker/elm327/scenarios/audi_a3_tdi.py` — una entrada
  nueva para el header `7DF`. Riesgo acotado: no modifica ninguna entrada existente, y el
  filtro de header del emulador garantiza que la nueva solo casa con el barrido. La
  regresión a descartar es una sola, `getSupportedPids()` (tarea 1.3b).
- **Comportamiento del LLM**: `apps/core-api/src/application/prompts/cognitiveDiagnosisPrompt.ts`.
  **Requiere `pnpm eval:agent` con la clave del usuario para validarse** — y el grupo A
  entero, no solo B-E, porque un bloque nuevo puede volver al agente más verboso.
- **Dominio → UI**: `domain/entities/dtcCode.ts`, `infrastructure/elm327/elm327Adapter.ts`
  y `protocol.ts`, el DTO de respuesta y `apps/ui/src/components/dashboard/TopologyMapPanel.tsx`.
