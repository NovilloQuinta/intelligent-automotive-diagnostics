## 0. Preparación

- [ ] 0.1 **Comprobar que `fix-vehicle-identity-and-live-data` está mergeado en `develop`.** Si no lo está, parar: los dos reescriben `elm327Adapter.ts` y chocarían
- [ ] 0.2 Crear `feat/obd-standard-modes` desde `develop`
- [ ] 0.3 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [ ] 0.4 Cargar contexto: este `proposal.md`/`design.md`, `elm327Adapter.ts` (sobre todo `clearDtcCodes` y `readDtcCodes`), `protocol.ts` (`parseDtcResponse`), `domain/dtcCatalog.ts`, `DiagnosisController.ts`, `DtcPanel.tsx`, `docker/elm327/scenarios/*.py`
- [ ] 0.5 Con los emuladores levantados, comprobar con `pnpm obd:send` qué responden hoy a `01 01`, `04`, `07` y `0A` — es el punto de partida

## 1. Emuladores

- [ ] 1.1 Audi: `01 01` con testigo encendido y nº de averías coherente con su Mode 03 (P0301, P0401, P2002)
- [ ] 1.2 Audi: `07` con al menos una avería pendiente, y `0A` con al menos una permanente
- [ ] 1.3 Audi: `04` con confirmación positiva
- [ ] 1.4 Kawasaki y Toyota: testigo apagado, `07` y `0A` sin averías, `04` con confirmación positiva
- [ ] 1.5 `docker compose build && docker compose up -d`; verificar los tres escenarios con `pnpm obd:send`
- [ ] 1.6 Anotar en el reporte que el emulador no cambia de estado tras el `04` — comportamiento esperado, no un fallo

## 2. Backend: estado del testigo del motor

- [ ] 2.1 RED: test — el adaptador lee `01 01` y devuelve testigo encendido y nº de averías con el bit 7 activo
- [ ] 2.2 RED: test — con el bit 7 a cero, testigo apagado
- [ ] 2.3 GREEN: implementar la lectura y el decodificado del byte A
- [ ] 2.4 RED: test — `NO DATA` se traduce en "no soportado", no en un valor por defecto
- [ ] 2.5 GREEN: implementar el caso no soportado
- [ ] 2.6 RED: test — el testigo nunca se deduce de la presencia de averías en Mode 03
- [ ] 2.7 Documentar en el código qué contienen los bytes B, C y D (monitores de emisiones), que quedan sin interpretar por decisión
- [ ] 2.8 REFACTOR: con la suite en verde — revisar nombres y que el decodificado de bits no quede disperso

## 3. Backend: averías pendientes y permanentes

- [ ] 3.1 RED: test — la misma trama de bytes procesada como Mode 03, 07 y 0A da los mismos códigos
- [ ] 3.2 GREEN: parametrizar el parser existente por modo; **no duplicar `parseDtcResponse`**
- [ ] 3.3 RED: test — Mode 07 devuelve los códigos pendientes con descripción del catálogo
- [ ] 3.4 RED: test — Mode 0A devuelve los permanentes con descripción del catálogo
- [ ] 3.5 GREEN: implementar ambas lecturas en el adaptador y en el puerto `ObdRepository`
- [ ] 3.6 RED: test — sin averías, lista vacía; con `NO DATA`, "no soportado"; son casos distintos
- [ ] 3.7 GREEN: distinguir ambos casos
- [ ] 3.8 REFACTOR: con la suite en verde — comprobar que no ha aparecido lógica de parseo copiada

## 4. Backend: endpoints

- [ ] 4.1 RED: test — `POST /api/clear-dtc` envía `04` al vehículo y responde 200
- [ ] 4.2 RED: test — escenario inexistente responde 404; sin `scenarioId` en modo docker, 400
- [ ] 4.3 GREEN: controlador, ruta, schema Zod, swagger y rate limit siguiendo el patrón existente
- [ ] 4.4 RED: test — un rechazo del vehículo se distingue de un fallo de comunicación
- [ ] 4.5 GREEN: mapeo de errores
- [ ] 4.6 RED: test — `GET /api/vehicle-status` devuelve testigo y nº de averías
- [ ] 4.7 GREEN: endpoint de estado
- [ ] 4.8 Exponer las listas pendientes y permanentes en la respuesta de diagnóstico existente
- [ ] 4.9 REFACTOR: con la suite en verde — verificar que los controladores no duplican la resolución de escenario

## 5. UI: testigo del motor

- [ ] 5.1 RED: test — con el testigo encendido se muestra el indicador en estado de alarma
- [ ] 5.2 RED: test — apagado, en estado normal
- [ ] 5.3 GREEN: componente de testigo en el dashboard
- [ ] 5.4 RED: test — dato no disponible se muestra como tal, sin dar por hecho que está apagado
- [ ] 5.5 REFACTOR: con la suite en verde

## 6. UI: tres listas y botón de borrado

- [ ] 6.1 RED: test — el panel pinta las tres secciones con sus códigos y descripciones
- [ ] 6.2 GREEN: reestructurar `DtcPanel` en tres secciones con su explicación breve
- [ ] 6.3 RED: test — una sección sin averías se muestra vacía, no se oculta
- [ ] 6.4 RED: test — una sección no soportada se distingue de una vacía
- [ ] 6.5 GREEN: estados vacío y no soportado
- [ ] 6.6 RED: test — pulsar borrar abre el diálogo y **no** emite ninguna petición
- [ ] 6.7 RED: test — el diálogo menciona la pérdida del freeze frame y que las permanentes no se borran
- [ ] 6.8 RED: test — cancelar no emite petición; confirmar la emite y luego refresca
- [ ] 6.9 GREEN: diálogo de confirmación y refresco posterior
- [ ] 6.10 REFACTOR: con la suite en verde — revisar que las tres secciones no sean tres copias del mismo bloque

## 7. Verificación manual

- [ ] 7.1 Audi: testigo encendido, nº de averías correcto, tres listas con contenido y descripciones
- [ ] 7.2 Kawasaki: testigo apagado, tres listas vacías mostradas como vacías
- [ ] 7.3 Botón de borrar: aparece el diálogo con el aviso completo; cancelar no hace nada
- [ ] 7.4 Confirmar el borrado: responde bien y la pantalla se refresca; las averías siguen ahí por ser emulador — comprobar que se entiende y no parece un error
- [ ] 7.5 Anotar los resultados en el reporte — material para la memoria del TFM

## 8. Cierre

- [ ] 8.1 `@security` sobre `POST /api/clear-dtc`: es la única operación de escritura sobre el vehículo; validación, rate limit y autorización
- [ ] 8.2 `@reviewer` sobre el diff completo
- [ ] 8.3 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde, también `pnpm test:ui`
- [ ] 8.4 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 8.5 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 8.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
