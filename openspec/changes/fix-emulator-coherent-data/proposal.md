## Why

Los escenarios del emulador están bien construidos en lo técnico — fórmulas SAE J1979 correctas, subconjunto de PIDs coherente con el tipo de motor, direcciones CAN reales — pero **los valores no cuentan la historia de la avería que el propio escenario declara**.

El Audi es el caso claro. Reporta tres averías:

- **P0301** — fallo de encendido en el cilindro 1
- **P0401** — flujo de EGR insuficiente
- **P2002** — eficiencia del filtro de partículas por debajo del umbral

Y a la vez sus sensores describen un motor sano: 800 rpm exactas y perfectamente estables, carga calculada del 18 %, error de EGR de apenas −4,7 %, y ni un solo dato de carga del filtro de partículas. Un diésel con un cilindro que no aporta **tiembla al ralentí y sube la carga**; un EGR obstruido da un error muy negativo, no residual; y un filtro saturado se ve en la contrapresión de escape.

Esto no es un defecto estético. Es un defecto que **invalida la parte más valiosa del sistema**: el diagnóstico cognitivo lee esos PIDs mediante la tool `read_pid` y razona sobre ellos. Si los valores dicen que todo está bien, el modelo no tiene evidencia con la que llegar a la conclusión correcta, y cualquier respuesta acertada procede del código del DTC, no del razonamiento. Ante la pregunta de cómo llegó el modelo a esa conclusión, la respuesta honesta hoy sería: no llegó.

Y el emulador es el banco de pruebas de todo lo que viene — chat conversacional, perfiles de usuario, recuperación RAG. Todo se apoya en que la IA razone sobre lecturas creíbles.

## What Changes

- **Audi A3 2.0 TDI — los valores pasan a ser consistentes con sus tres averías:**
  - Ralentí inestable y carga calculada elevada, propios de un cilindro que no aporta par.
  - Error de EGR marcadamente negativo, coherente con flujo insuficiente ante un EGR comandado alto.
  - Datos de contrapresión y carga del filtro de partículas que justifiquen el P2002, incluida temperatura de escape elevada.
  - Consumo de aire y presión de admisión ajustados al conjunto anterior, no a un motor sano.
- **Freeze frame capturado en condiciones de fallo**, no en el ralentí caliente actual: un fallo de encendido se registra bajo carga. Los valores del Mode 02 deben diferir de los del Mode 01 y ser plausibles como instante del fallo.
- **Kawasaki Z900 y Toyota Auris — contraste coherente**: sin averías, y valores que efectivamente correspondan a un motor sano en su régimen. Revisar el Kawasaki, que declara 4500 rpm con 105 °C y 0 km/h — plausible en un banco, extraño en una lectura de taller.
- **Documentar en cada escenario la historia que cuenta**: un comentario de cabecera que explique qué le pasa al vehículo y qué valores lo sostienen, para que un cambio futuro no rompa la coherencia sin darse cuenta.
- **Un test que proteja la coherencia**: verificar que los PIDs relacionados con cada DTC declarado están dentro del rango que corresponde a esa avería. Es lo único que evita que esto vuelva a divergir.

## Capabilities

### New Capabilities
- `emulator-coherent-data`: Los escenarios del emulador ELM327 exponen valores de PID consistentes con los códigos de avería que declaran, de forma que el diagnóstico cognitivo pueda razonar sobre evidencia real y no sobre el código del DTC.

## Dependencies

**Depende de `fix-vehicle-identity-and-live-data`**, que debe estar mergeado en `develop` antes de empezar: ese cambio ya modifica los tres escenarios (Mode 09 para el VIN, PIDs de Mode 02 para el freeze frame) y amplía el freeze frame del Audi. Empezar antes garantiza conflictos en los mismos ficheros.

No es requisito, pero este cambio gana mucho valor junto a `add-obd-standard-modes`: el número de averías del Mode 01 PID 01 y las listas de pendientes y permanentes también deben cuadrar con la historia de cada vehículo.

## Impact

- Modificado: `docker/elm327/scenarios/audi_a3_tdi.py` (valores de Mode 01 y Mode 02, nuevos PIDs de filtro de partículas)
- Modificado: `docker/elm327/scenarios/kawasaki_z900.py` (revisión de régimen y temperaturas)
- Modificado: `docker/elm327/run_toyota.py` (revisión de los valores del escenario nativo)
- Modificado: `apps/core-api/src/infrastructure/composition/composition.ts` (los `sensorValues` del catálogo de escenarios deben coincidir con lo que responde el emulador)
- Nuevo: test de coherencia entre DTCs declarados y valores de PID por escenario
- Sin cambios en el código de producción del adaptador, los casos de uso ni la UI
