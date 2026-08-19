> **Un ciclo = RED → GREEN → REFACTOR, los tres pasos siempre.** El refactor es el cierre
> de *su* ciclo, no una limpieza al final del bloque: se hace sobre el código que el GREEN
> de esa misma tarea acaba de escribir, con sus tests ya en verde.
>
> Criterio de cierre del REFACTOR, para que sea binario como los otros dos:
>
> 1. **Tests en verde sin tocar sus aserciones.** Si hay que cambiar un test para que el
>    refactor pase, no era refactor: era cambio de comportamiento, y va en su propio ciclo.
> 2. **Ningún aviso nuevo de ESLint** (`max-lines-per-function` 40, `complexity` 5) contra
>    la línea base de la tarea 0. Si aparece uno, o se parte la función o lleva el disable
>    razonado que exige `AGENTS.md`; documentarlo como deuda **no** vale.
> 3. **Commit propio** (`refactor(ámbito): …`), nunca dentro del commit del GREEN.
>
> Cuando un ciclo no tenga nada que extraer, el REFACTOR se cierra diciéndolo. Lo que no
> vale es que no aparezca.

## 0. Línea base

- [x] 0.1 Medir en `develop`: avisos de `max-lines-per-function` y de `complexity`, y las
      cifras concretas de las tres funciones que este change hace crecer (`discoverEcus`,
      `parseCanHeaders`, `resolveEcuAddress`). Es el contra qué de todos los REFACTOR.

## 1. Ciclo: traducir el protocolo que el adaptador ya negoció

- [x] 1.1 RED: `tests/unit/infrastructure/elm327/protocolNumber.test.ts` — los diez
      protocolos, el prefijo `A` (`'A6'`), la respuesta sucia (`'A6\r\r>'`) y la entrada
      irreconocible (`''`, `'?'`, `'BUS INIT: ERROR'`) devolviendo `null`.
- [x] 1.2 GREEN: `infrastructure/elm327/protocolNumber.ts`, tabla número →
      `{ familia, dirección funcional, dirección física del ECM, etiqueta }`. Puro, sin
      dependencias. **No va en `domain/`**: la numeración de `AT DPN` es del chip ELM327,
      no de la norma (D2 de `design.md`).
- [x] 1.3 REFACTOR: la tabla es dato, no lógica — que se lea como tal. TSDoc del export
      público con la correspondencia número ↔ bus, que es conocimiento de la hoja de datos
      del ELM327 y no se deduce leyendo el código.

## 2. Ciclo: el parser reconoce cabeceras de 29 bits

- [x] 2.1 RED: en `protocol.test.ts`, una respuesta con `18DAF110` / `18DAF111` devuelve
      ambos; `18DBF110` (no dirigido al equipo de diagnóstico) se descarta, y los 11-bit
      fuera de `7E8–7EF` se siguen descartando.
- [x] 2.2 GREEN: `CAN_HEADER_LINE_RE` (`protocol.ts:241`) acepta 3 u 8 dígitos hex; la
      validez de 29 bits es estructural (`18DAF1` + byte de ECU), no un rango numérico
      (D3). El rango de 11 bits no se toca.
- [x] 2.3 REFACTOR: actualizar el TSDoc de `parseCanHeaders` (`:254-265`), que hoy afirma
      lo contrario de lo que el código hace ya. Nombrar la constante del prefijo de 29 bits
      en vez de dejarla incrustada en el regex.

## 3. Ciclo: el catálogo resuelve los dos anchos de dirección

- [x] 3.1 RED: `resolveEcuAddress` con `18DAF110` devuelve ECM y petición `18DA10F1`; con
      `18DAF111`, `UNKNOWN` y petición `18DA11F1`. Los casos de 11 bits siguen intactos.
- [x] 3.2 GREEN: aceptar los dos anchos; derivar la petición restando 8 en 11 bits e
      intercambiando los dos últimos bytes en 29. Entrada estándar nueva `18DAF110`.
- [x] 3.3 REFACTOR — **la duplicación aparece aquí**: es el segundo módulo que pregunta
      "¿de qué ancho es esta dirección?" (el primero fue 2.2). Extraerlo a un único sitio
      —el descriptor de 1.2, que ya conoce la familia del bus— y que parser y catálogo lo
      consuman en vez de llevar cada uno su propio `length === 3`.
      **Cierre**: `grep` no encuentra una segunda definición del ancho.

## 4. Ciclo: el barrido pregunta el protocolo en vez de imponerlo

- [x] 4.1 RED: el primer comando del barrido es `AT DPN` y **`AT SP 6` no aparece**.
      Actualizar los 8 casos de `ecuDiscovery.test.ts` al nuevo guion (las secuencias están
      como literales propios en `:5-6`; se mantiene ese patrón).
- [x] 4.2 GREEN: quitar `'AT SP 6'` de `ECU_SCAN_INIT_SEQUENCE`, leer `AT DPN` primero y
      derivar la dirección de broadcast del descriptor.
- [x] 4.3 REFACTOR: extraer la resolución del protocolo —consultar, traducir, decidir si se
      sigue— a su propia función, de modo que `discoverEcus` quede como lo que es: reservar,
      resolver, barrer, restaurar.
      **Cierre**: `discoverEcus` por debajo de 40 líneas y de complejidad 5 **sin disable**.

## 5. Ciclo: en un bus pre-CAN el barrido se abstiene

- [x] 5.1 RED: con protocolo 3 o 5, o con respuesta irreconocible, devuelve `[]` **y `sent`
      contiene únicamente `AT DPN`**. Es la aserción que blinda el bug: nada más sale al bus.
- [x] 5.2 GREEN: guarda de familia antes de tocar la configuración del adaptador.
- [x] 5.3 REFACTOR: que la abstención se lea como decisión explícita y no como un hueco del
      `if`. Sin duplicar la guarda entre el camino del broadcast y el del fallback.

## 6. Ciclo: barrido en CAN de 29 bits

- [x] 6.1 RED: broadcast a `18DB33F1`; `18DAF110` y `18DAF111` resueltos a ECM y UNKNOWN
      con sus peticiones `18DA10F1` / `18DA11F1`.
- [x] 6.2 GREEN: direcciones tomadas del descriptor, nunca literales en `discoverEcus`.
- [x] 6.3 REFACTOR: si el camino de 11 y el de 29 bits quedaron simétricos, que compartan
      cuerpo; si no lo son, que se vea por qué. Ningún literal de dirección suelto.

## 7. Ciclo: el barrido devuelve el adaptador como lo encontró

- [x] 7.1 RED: el restore deja la dirección funcional del protocolo detectado (`7DF` /
      `18DB33F1`), no `7E0`. Los dos tests de "restaura aunque lance" siguen pasando.
- [x] 7.2 GREEN: `ECU_SCAN_RESTORE_SEQUENCE` se deriva del descriptor. Sigue en el `finally`.
- [x] 7.3 REFACTOR: init y restore son la misma lista leída en dos sentidos — que se note en
      el código, o que quede dicho por qué no puede ser.

## 8. Ciclo: la ECU descubierta declara el bus real

- [x] 8.1 RED: protocolo 8 produce `CAN_11_250`; protocolo 7, `CAN_29_500`.
- [x] 8.2 GREEN: la etiqueta sale del descriptor. `DISCOVERED_ECU_PROTOCOL` desaparece.
- [x] 8.3 REFACTOR: comprobar que no queda ningún otro sitio suponiendo `CAN_11_500`.

## 9. Ciclo: el fallback físico usa la dirección del protocolo

- [x] 9.1 RED: en 29 bits, `discoverPrimaryEcu` se dirige a `18DA10F1` y devuelve
      `18DAF110`; en 11 bits sigue con `7E0`/`7E8`.
- [x] 9.2 GREEN: direcciones del descriptor también aquí (`ecuDiscovery.ts:80`).
- [x] 9.3 REFACTOR: el fallback comparte con el broadcast la construcción de la ECU
      resultante — una sola.

## 10. Ciclo: solo lectura forzada con un coche real conectado

- [x] 10.1 RED: `serial` y `tcp` construyen el adaptador con `readOnly: true` aunque
      `OBD_READ_ONLY` sea `false`; `docker` sigue respetando la variable.
- [x] 10.2 GREEN: derivar el valor efectivo una sola vez en `composition/diagnosis.ts`,
      consumido por los tres cableados (`:78`, `:96`, `:121`).
- [x] 10.3 REFACTOR: el mensaje de `UnsafeObdModeError` (`elm327Adapter.ts:250`) distingue
      las dos causas —variable puesta o modo de conexión—, o parecerá un fallo en vez de
      una protección.

## 11. Verificación

- [x] 11.1 `elm327AdapterInvariant.test.ts` verde **sin tocarlo**: nada de esto abre una
      vía de escritura nueva.
- [x] 11.2 Contra el emulador con `OBD_TRACE=true`: sale `AT DPN`, **no** sale `AT SP 6`, y
      el barrido del Audi sigue devolviendo las cinco ECUs del escenario.
      **Hecho el 19/08 sin Docker** (no hay demonio en el entorno): `pip install
      ELM327-emulator` en un venv + `python docker/elm327/run_audi.py`, que es lo mismo que
      hace la imagen. Resultado: 5 ECUs (`7E8`, `7E9`, `7EA`, `7EB`, `7ED`), etiqueta
      `CAN_11_500`, y la traza confirma la secuencia sin `AT SP`.
      **Destapó dos fallos que los tests no veían** — ver 11.2b y 11.2c.
- [x] 11.3 Descartar la regresión concreta: `GET /api/live-data` devuelve valores **antes y
      después** de un barrido. Es el cabo suelto de `docs/deuda-conocida.md`.
      **Verificado**: 770 rpm / 90 °C / 0 km/h / 35 °C antes y después, HTTP 200 los dos.
      Ojo con el rate limit de 1 req/s del endpoint: sin pausa entre lecturas responde 429 y
      parece un `null` de la aplicación. Ese falso positivo costó una vuelta.
      **Conclusión para la deuda**: el estado que deja el barrido NO explica aquel `null`.
      La causa sigue sin identificar.
- [x] 11.2b El emulador tiene el eco activado y `AT DPN` es el primer comando, antes de
      `AT E0`: la respuesta real es `"AT DPN\rA6\r\r>"`. Aplanarla daba `"AT DPNA6"` y el
      barrido se abstenía en un coche capaz. `resolveCanBus` pasa a leer línea a línea.
      La traza no lo mostraba: `flatten` (`traceConsole.ts`) descarta el eco.
- [x] 11.2c **El restore a la dirección funcional era un error mío**: con `AT SH 7DF` puesto,
      `01 0C` responde `NO DATA`; con `AT SH 7E0`, `41 0C 0C 08`. Revertido a la dirección
      física del ECM, que es lo que hacía el código original. Corregidos `design.md` (D4),
      el ADR 009, la proposal, la spec delta y `deuda-conocida.md`, que afirmaban lo
      contrario.
- [x] 11.4 Recuento de avisos de ESLint contra la línea base de 0.1. Igual o menor.
- [x] 11.5 `pnpm verify` completo (lint + format + test + build + typecheck de ambas apps).

## 12. Cierre

> Las tareas 12.1–12.3 **documentan lo que la herramienta hace**; las 12.5–12.8 **corrigen
> lo que queda falso**. Las primeras son las que se evaporan si el bloque se aplaza: la
> 12.2 puede escribirse ya, porque su razonamiento está entero en `design.md`.

- [x] 12.1 Sección nueva en `docs/tfm/03-obd-elm327-emulador.md`, junto a la 4.1 "Tabla
      completa de modos": los diez protocolos, cuáles barre el descubrimiento de ECUs
      (los cuatro CAN), qué pasa en los pre-CAN (se abstiene, y las lecturas siguen
      funcionando) y de dónde sale el bitrate — del `ATSP0` del adaptador, nunca de
      nuestro código.
- [x] 12.2 ADR 009: negociar el protocolo en vez de imponerlo, y limitar el barrido a CAN.
      Recoge D1, D3 y las alternativas descartadas de `design.md`, que se archiva con el
      change; el ADR es lo que queda discoverable después.
- [x] 12.3 `README.md:6` y `:23`: añadir `ISO 15765-4` a la línea de normativa, que hoy
      cita SAE J1979 / ISO 15031-5 / ISO 3779 y se deja fuera justo la norma del bus CAN.
- [x] 12.4 `pnpm obd:probe` imprime también `AT DP` (el nombre en texto) junto al `AT DPN`
      que ya imprime (`probe-serial.ts:182`): el número es para la lógica, el texto es para
      que el mecánico confirme de un vistazo que coinciden.
- [x] 12.5 `.env.example` y la tabla de entorno del `README.md`: en `serial`/`tcp` el solo
      lectura es forzado.
- [x] 12.6 `docs/guion-demo.md:177-178`: el aviso «`ecuDiscovery.ts` fuerza `AT SP 6` [...]
      está clavado a fuego» queda falso. Sustituir por lo que hace ahora.
- [x] 12.7 `docs/deuda-conocida.md`: en el cabo suelto de `live-data`, anotar la causa
      probable corregida. **No cerrarlo**: no se ha reproducido.
- [x] 12.8 `docs/estado-actual.md` (regla 8: máximo 15 líneas, solo estado presente).
- [x] 12.9 Archivar el change y sincronizar la spec. Sincronizados los dos requisitos
      MODIFIED y los dos ADDED contra `openspec/specs/`.
