## 0. Preparación

- [ ] 0.1 **Comprobar que `fix-vehicle-identity-and-live-data` está mergeado en `develop`.** Ese cambio ya toca los tres escenarios (Mode 09 para el VIN, PIDs de Mode 02) — empezar antes provoca conflictos en los mismos ficheros
- [ ] 0.2 Crear `fix/emulator-coherent-data` desde `develop`
- [ ] 0.3 Verificar baseline: `pnpm lint && pnpm format && pnpm test && pnpm build` en verde; anotar nº de tests
- [ ] 0.4 Cargar contexto: este `proposal.md`/`design.md`, los tres escenarios de `docker/elm327/`, `composition.ts` (catálogo), `pidFormulaCatalog.ts`, `domain/pids.ts`
- [ ] 0.5 Levantar los emuladores y volcar la lectura actual de todos los PIDs de los tres vehículos con `pnpm obd:send` — es el antes/después del cambio, y material para la memoria

## 1. Audi: P0301 (fallo de encendido cilindro 1)

- [x] 1.1 Subir la carga calculada del motor a un valor propio de compensación por cilindro que no aporta par
- [x] 1.2 Bajar el régimen por debajo del objetivo de ralentí
- [x] 1.3 Comentar cada valor con su cálculo, como ya hace el escenario
- [x] 1.4 Documentar en la cabecera que el ralentí inestable es oscilación y no puede representarse con tramas fijas — solo el desplazamiento respecto al nominal

## 2. Audi: P0401 (flujo de EGR insuficiente)

- [x] 2.1 Llevar el error de EGR a un valor marcadamente negativo, coherente con recirculación comandada y no obtenida
- [x] 2.2 Subir el caudal de aire: al no entrar gases de escape, entra más aire fresco
- [x] 2.3 Comentar explícitamente esa relación contraintuitiva en el escenario — es la pista que hace valioso el razonamiento del modelo
- [x] 2.4 Revisar que la presión de admisión sigue siendo coherente con el conjunto

## 3. Audi: P2002 (eficiencia del filtro de partículas)

- [x] 3.1 Subir la temperatura de escape a un valor propio de filtro saturado
- [x] 3.2 Añadir DID de Mode 22 con carga de hollín elevada, siguiendo el patrón de los DIDs VAG ya presentes
- [x] 3.3 Comprobar que el nuevo DID no requiere tocar las máscaras de PIDs de Mode 01 (es Mode 22, rango distinto)

## 4. Audi: coherencia interna y freeze frame

- [x] 4.1 Corregir la incoherencia entre tiempo de marcha (120 s) y refrigerante (90 °C): subir el tiempo de marcha
- [x] 4.2 Revisar el resto de valores buscando incoherencias del mismo tipo, no solo las ligadas a DTCs
- [x] 4.3 Llevar los valores de Mode 02 a un instante bajo carga: régimen medio, vehículo en movimiento, carga alta, refrigerante caliente
- [x] 4.4 Verificar que los valores de Mode 02 difieren de forma apreciable de los de Mode 01 para los mismos PIDs
- [ ] 4.5 Confirmar que los PIDs de Mode 02 introducidos por el cambio anterior siguen respondiendo

## 5. Vehículos sanos

- [x] 5.1 Kawasaki: revisar régimen y temperatura. Resultado: el escenario ya daba 1300 rpm y 95 °C, correctos — el 4500 rpm que se sospechaba estaba en el catálogo, no aquí. Lo que sí estaba mal era la carga del motor al 58 %, corregida a 18 %
- [x] 5.2 Kawasaki: comprobar que no queda ningún valor fuera de rango — es el grupo de control
- [ ] 5.3 Toyota: revisar los valores del escenario nativo `car` y anotar cuáles son plausibles y cuáles no
- [ ] 5.4 Toyota: dado que es híbrido, comprobar si el escenario lo refleja de algún modo; si no, anotarlo como dato pendiente para `add-user-profiles`, que lo necesita para las advertencias de alto voltaje
- [x] 5.5 Documentar la cabecera de cada escenario con la historia que cuenta

## 6. Test de coherencia

- [x] 6.1 RED: test — con los valores nuevos del Audi, cada DTC declarado queda respaldado por sus PIDs
- [x] 6.2 GREEN: implementar la comprobación. **Desviación respecto al `design.md`**: el test extrae las tramas del fichero de escenario y las decodifica con las fórmulas SAE reales, en vez de consultar al emulador por TCP. Motivo: así corre en CI sin depender de que Docker esté levantado. Sigue sin replicar valores esperados — comprueba rangos derivados de cada avería
- [x] 6.3 RED: test — devolver el error de EGR a un valor normal pese a declarar P0401 hace fallar el test, indicando qué avería queda sin respaldo
- [x] 6.4 GREEN: mensajes de fallo que digan qué avería y qué PID
- [x] 6.5 RED: test — los escenarios sin averías no tienen ningún PID fuera de rango
- [x] 6.6 REFACTOR: con la suite en verde — comprobar que el test no replica los valores esperados del fichero de escenario, o no comprueba nada

## 7. Alineación del catálogo

- [x] 7.1 Actualizar los `sensorValues` de `composition.ts` para los tres escenarios, con los valores nuevos
- [x] 7.2 Comprobar que la misma lectura no sale distinta en dos partes de la pantalla
- [x] 7.3 Anotar como deuda que `sensorValues` debe desaparecer cuando la telemetría lea del vehículo
- [x] 7.4 Revisar las máscaras de PIDs soportados: deben declarar exactamente los PIDs que cada escenario responde

## 8. Tests existentes

- [x] 8.1 Ejecutar la suite completa e identificar qué tests fallan por tener valores antiguos escritos como esperados
- [x] 8.2 Actualizar cada uno **entendiendo qué comprobaba**; si un test solo fijaba un número, valorar si aporta algo
- [x] 8.3 Confirmar que ningún test de parseo o de fórmulas se ha debilitado para hacerlo pasar

## 9. Verificación manual

- [ ] 9.1 `docker compose build && docker compose up -d`; leer los tres vehículos y comprobar los valores nuevos
- [ ] 9.2 Diagnóstico del Audi en la UI: comprobar que los valores en pantalla apuntan a las tres averías
- [ ] 9.3 **La prueba de fuego**: preguntar al diagnóstico cognitivo por el Audi y comprobar que la explicación se apoya en los valores leídos, no solo en el código del DTC. Si el modelo menciona el caudal de aire elevado por el EGR obstruido, el cambio ha funcionado
- [ ] 9.4 Comparar la misma pregunta sobre la Kawasaki: la respuesta debe ser claramente distinta
- [ ] 9.5 Guardar las respuestas del antes y el después — es la evidencia de que la IA razona, y va directa a la memoria del TFM

## 10. Cierre

- [ ] 10.1 `@reviewer` sobre el diff completo
- [x] 10.2 `pnpm lint && pnpm format && pnpm test && pnpm build` en verde (732 tests). `pnpm test:ui` NO ejecutado: este cambio no toca la UI
- [ ] 10.3 `gga run` en verde (comprobar el STATUS real del reporte, no solo el exit code del hook)
- [ ] 10.4 Actualizar `SESION ACTUAL` en `AGENTS.md`
- [ ] 10.5 Guardar en Engram el criterio de coherencia y la cadena causal de cada avería
- [ ] 10.6 **Preguntar antes de commitear/pushear** (regla 7) — mostrar resumen y esperar OK humano
