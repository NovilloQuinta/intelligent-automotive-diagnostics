> **El REFACTOR de cada ciclo tiene criterio de terminación, igual que RED y GREEN.**
> Sin él se cae de la lista: «el test pasa» es binario y «mejora el código» no, así que
> con prisa siempre gana el verde. El criterio es medible y lo dan las herramientas que ya
> están puestas:
>
> 1. **Cero avisos nuevos de ESLint.** `max-lines-per-function` (40) y `complexity` (5).
>    Se mide en `develop` antes de empezar y se compara al cerrar cada bloque. Un aviso
>    nuevo cierra el bloque solo si se justifica con el disable razonado que exige
>    `AGENTS.md` ("Excepciones al limite de 40 lineas"); si no, se parte.
> 2. **Cero duplicación anunciada.** Los objetivos de este change están identificados de
>    antemano en 2.6 y 3.8, no son un «revisa a ver si mejoras algo».
> 3. **Tests verdes durante todo el REFACTOR**, sin tocar sus aserciones. Si hay que
>    cambiar un test para que el refactor pase, no es refactor: es un cambio de
>    comportamiento y va en su propio ciclo.
>
> Commit propio por refactor (`refactor(ámbito): …`), nunca mezclado con el GREEN que lo
> provocó.

## 1. Traducir el protocolo negociado (aditivo, aislado)

- [ ] 1.0 Medir la línea base en `develop`: número de avisos de `max-lines-per-function` y
      de `complexity`, y las cifras concretas de las tres funciones que este change hace
      crecer (`discoverEcus`, `parseCanHeaders`, `resolveEcuAddress`). Sin línea base no
      hay criterio de cierre para los REFACTOR de 2.6 y 3.8.
- [ ] 1.1 RED: `tests/unit/infrastructure/elm327/protocolNumber.test.ts` — los diez
      protocolos, el prefijo `A` (`'A6'`), la respuesta sucia (`'A6\r\r>'`) y la entrada
      irreconocible (`''`, `'?'`, `'BUS INIT: ERROR'`) devolviendo `null`.
- [ ] 1.2 GREEN: `infrastructure/elm327/protocolNumber.ts` con la tabla número →
      `{ familia, dirección funcional, etiqueta }`. Puro, sin dependencias.
      **No va en `domain/`**: la numeración de `AT DPN` es del chip ELM327, no de la norma
      (ver D2 en `design.md`).
- [ ] 1.3 TSDoc del export público, con la tabla de protocolos en el bloque del módulo.

## 2. Aceptar direcciones CAN de 29 bits (parser + catálogo)

- [ ] 2.1 RED: en `protocol.test.ts`, una respuesta con headers `18DAF110` / `18DAF111`
      devuelve ambos; `18DBF110` (no dirigido al tester) y los headers 11-bit fuera de
      rango se siguen descartando.
- [ ] 2.2 GREEN: `CAN_HEADER_LINE_RE` (`protocol.ts:241`) acepta 3 u 8 dígitos hex, y la
      validez de 29 bits es estructural (`18DAF1` + byte de ECU), no un rango numérico
      (ver D3). El rango `7E8–7EF` de 11 bits no se toca.
- [ ] 2.3 Actualizar el TSDoc de `parseCanHeaders` (`:254-265`), que hoy dice
      explícitamente que los headers de 29 bits se descartan.
- [ ] 2.4 RED/GREEN en `ecuAddressCatalog`: `resolveEcuAddress` acepta los dos anchos;
      la petición se deriva restando 8 en 11 bits e intercambiando los dos últimos bytes
      en 29 bits. Entrada estándar nueva: `18DAF110` → `18DA10F1`, Engine Control Module.
- [ ] 2.5 Verificar que **no** hace falta tocar `EcuInfo` ni el schema de SQLite (medido:
      regex sin límite de longitud, columnas `text` sin ancho). Si algún test lo desmiente,
      parar y replantear antes de tocar persistencia.
- [ ] 2.6 **REFACTOR — duplicación anunciada**: 2.2 y 2.4 introducen la misma pregunta en
      dos módulos distintos ("¿esta dirección es de 11 o de 29 bits?"). Extraer esa
      discriminación a un único sitio —el descriptor de protocolo de 1.2, que ya conoce la
      familia del bus— y que parser y catálogo la consuman en vez de reimplementarla cada
      uno con su `length === 3`.
      **Criterio de cierre**: una sola definición del ancho de dirección en el árbol
      (`grep` no encuentra una segunda), avisos de ESLint sin subir respecto a 1.0, y los
      tests de 2.1 y 2.4 pasando **sin tocar sus aserciones**.

## 3. El barrido pregunta el protocolo en vez de imponerlo

- [ ] 3.1 RED: el barrido emite `AT DPN` como primer comando y **`AT SP 6` no aparece**
      en la secuencia. Actualizar los 8 casos existentes de `ecuDiscovery.test.ts` al
      nuevo guion (las secuencias están como literales propios en `:5-6`, se mantiene ese
      patrón).
- [ ] 3.2 RED: con un protocolo pre-CAN (3, 5) o una respuesta irreconocible, el barrido
      devuelve `[]` **y `sent` contiene únicamente `AT DPN`**. Esta es la aserción que
      blinda el bug: nada más sale al bus.
- [ ] 3.3 GREEN: quitar `'AT SP 6'` de `ECU_SCAN_INIT_SEQUENCE`, leer `AT DPN` primero y
      derivar la dirección de broadcast del descriptor. Abstenerse sin emitir ningún AT
      cuando no sea CAN.
- [ ] 3.4 RED/GREEN: barrido en 29 bits — broadcast a `18DB33F1`, headers `18DAF110` y
      `18DAF111` resueltos a ECM y UNKNOWN, peticiones `18DA10F1` / `18DA11F1`.
- [ ] 3.5 RED/GREEN: el restore devuelve la dirección funcional del protocolo detectado
      (`7DF` / `18DB33F1`), no `7E0`. Sigue en el `finally`: los dos tests de "restaura
      aunque lance" deben seguir pasando.
- [ ] 3.6 RED/GREEN: `EcuInfo.protocol` sale del descriptor — protocolo 8 produce
      `CAN_11_250`, protocolo 7 produce `CAN_29_500`. `DISCOVERED_ECU_PROTOCOL` desaparece.
- [ ] 3.7 El fallback físico al ECM (`discoverPrimaryEcu`, `:80`) usa la dirección física
      del protocolo detectado (`7E0` o `18DA10F1`) y su dirección de respuesta.
- [ ] 3.8 **REFACTOR — crecimiento anunciado de `discoverEcus`**: entre 3.3 y 3.7 gana la
      consulta de protocolo, la guarda CAN/no-CAN y tres direcciones derivadas del
      descriptor. Hoy es corta y de complejidad baja (medida en 1.0); con eso encima se
      acerca a los dos límites de ESLint a la vez. Extraer la resolución del protocolo
      —consultar `AT DPN`, traducir, decidir si se sigue— a su propia función, de modo que
      `discoverEcus` quede como lo que es: reservar, resolver, barrer, restaurar.
      **Criterio de cierre**: `discoverEcus` por debajo de 40 líneas y de complejidad 5 sin
      necesidad de disable, avisos totales sin subir respecto a 1.0, y los 8 tests
      existentes de `ecuDiscovery.test.ts` más los nuevos pasando **sin tocar sus
      aserciones**.

## 4. Solo lectura forzada con un coche real conectado

- [ ] 4.1 RED: `serial` y `tcp` construyen el adaptador con `readOnly: true` aunque
      `OBD_READ_ONLY` sea `false`; `docker` sigue respetando la variable.
- [ ] 4.2 GREEN: derivar el valor efectivo una sola vez en `composition/diagnosis.ts` y
      consumirlo en los tres cableados (`:78`, `:96`, `:121`).
- [ ] 4.3 El mensaje de `UnsafeObdModeError` (`elm327Adapter.ts:250`) distingue las dos
      causas —variable puesta o modo de conexión—, o parecerá un fallo en vez de una
      protección.
- [ ] 4.4 Comprobar que `elm327AdapterInvariant.test.ts` sigue verde sin tocarlo: nada de
      esto abre una vía de escritura nueva.

## 5. Verificación

- [ ] 5.1 Contra el emulador con `OBD_TRACE=true`: sale `AT DPN`, **no** sale `AT SP 6`,
      y el barrido del Audi sigue devolviendo las cinco ECUs del escenario.
- [ ] 5.2 Descartar la regresión concreta: `GET /api/live-data` devuelve valores **antes y
      después** de un barrido de ECUs. Es el cabo suelto de `docs/deuda-conocida.md`.
- [ ] 5.3 **Cerrar el criterio de refactor**: recuento de avisos de ESLint comparado contra
      la línea base de 1.0. Igual o menor. Si subió y el aviso no lleva disable razonado,
      el change no está terminado — se vuelve a 2.6 o a 3.8, no se documenta como deuda.
- [ ] 5.4 `pnpm verify` completo (lint + format + test + build + typecheck de ambas apps).

## 6. Cierre

- [ ] 6.1 `.env.example` y la tabla de entorno del `README.md`: en `serial`/`tcp` el solo
      lectura es forzado.
- [ ] 6.2 `docs/guion-demo.md:177-178`: el aviso «`ecuDiscovery.ts` fuerza `AT SP 6` [...]
      está clavado a fuego» queda falso. Sustituir por lo que hace ahora.
- [ ] 6.3 `docs/deuda-conocida.md`: en el cabo suelto de `live-data`, anotar la causa
      probable corregida. **No cerrarlo**: no se ha reproducido.
- [ ] 6.4 `docs/estado-actual.md` (regla 8: máximo 15 líneas, solo estado presente).
- [ ] 6.5 Archivar el change y sincronizar la spec.
