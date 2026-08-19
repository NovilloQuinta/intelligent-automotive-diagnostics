## 1. Multi-ECU en el emulador (Python, aditivo)

- [x] 1.1 Importar en `docker/elm327/scenarios/audi_a3_tdi.py` las cuatro constantes
      nuevas de `elm.obd_message`: `ECU_R_ADDR_T`, `ECU_R_ADDR_U`, `ECU_R_ADDR_B`,
      `ECU_R_ADDR_M`.
- [x] 1.2 **Añadir** una entrada nueva para `01 00` con `Header: "7DF"` (el broadcast
      funcional), cuya `Response` encadena un bloque `HD/SZ/DT` por ECU: el motor más las
      cuatro nuevas, cada una con su bitmask de PIDs soportados.
      **`ELM_PIDS_A` no se toca**: es la que responde al header por defecto `7E0` y la
      que consume `getSupportedPids()`. Ninguna otra respuesta cambia.
- [x] 1.3 Verificar a mano contra el emulador: levantar el contenedor y comprobar que
      con `AT SH 7DF` el `01 00` devuelve cinco líneas con headers distintos.
- [x] 1.3b Descartar la regresión concreta: con el header por defecto (`7E0`),
      `getSupportedPids()` del Audi devuelve **exactamente** la misma lista que antes del
      cambio. Es el único camino que la entrada nueva podría pisar.
- [x] 1.4 Actualizar `docs/infrastructure/elm327-emulator.md` con las cinco ECUs del
      escenario Audi.

## 2. El mapa marca la ECU averiada (dominio → UI)

- [ ] 2.1 RED: test de `parseDtcResponse` agrupando por header — una respuesta con dos
      headers devuelve los códigos de cada uno asociados a su dirección.
- [ ] 2.2 GREEN: variante de parseo que agrupa por header, reutilizando
      `parseCanHeaders` para validar direcciones.
- [ ] 2.3 Añadir `ecuAddress?: string` a `DtcCode`. **Opcional**: un DTC sin origen
      sigue siendo válido.
- [ ] 2.4 `fetchDtcCodes` emite con `AT H1` y restaura `AT H0` en `finally`, con el
      mismo patrón que `discoverEcus`. Test de que el estado se restaura aunque falle.
- [ ] 2.5 Propagar el origen por el DTO de respuesta hasta la UI.
- [ ] 2.6 RED/GREEN en `TopologyMapPanel`: recibe los DTC y marca el nodo cuyo
      `responseAddr` coincide; los DTC sin origen no marcan ninguno.
- [ ] 2.7 `pnpm verify` completo. Los 1241 L de `diagnosis.routes.test.ts` deben pasar
      sin tocarse.

## 3. El agente aprende ECUs (cambia comportamiento del LLM)

> Va al final a propósito: es lo único que no se puede validar en este entorno.

- [x] 3.1 Escribir el bloque de aprendizaje de ECUs en `cognitiveDiagnosisPrompt.ts`,
      simétrico a los de PID y DTC: `get_ecu_info` → `search_similar_ecus` → `index_ecu`.
- [x] 3.2 Test de que el prompt nombra las tres tools de la cadena de ECU.
- [ ] 3.3 **Requiere clave del usuario**: `pnpm eval:agent --only=B,C,D,E` y después
      **el grupo A entero**, porque un bloque nuevo puede volver al agente más verboso o
      más reticente en consultas legítimas.
- [ ] 3.4 Calibrar el prompt con las respuestas delante. Cada fallo que aparezca:
      preguntarse si puede bajar a invariante de código (unit test) o si de verdad es
      cosa del modelo (eval).

## 4. Cierre

- [ ] 4.1 Retirar de `docs/deuda-conocida.md` la entrada "El bucle de aprendizaje de
      ECUs no se ejercita".
- [ ] 4.2 Actualizar `docs/estado-actual.md`.
- [ ] 4.3 Archivar el change y sincronizar la spec.
