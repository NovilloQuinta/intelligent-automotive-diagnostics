## Contexto

El objetivo no es "poner números más bonitos": es que cada valor que responde el emulador tenga una razón física de ser ese, derivada de la avería que el escenario declara. Un mecánico que mire la pantalla debe poder llegar a la conclusión correcta con los datos delante, y el modelo también.

## Decisión 1: la avería manda sobre el valor, nunca al revés

Para cada DTC declarado se identifica qué PIDs debería alterar en un vehículo real, y esos PIDs se ajustan. Los PIDs sin relación con ninguna avería declarada se dejan como están.

**Por qué.** Cambiar valores "para que se vean interesantes" produce un escenario donde todo está mal y nada explica nada. El valor de un diagnóstico está en el contraste: la mayoría de las lecturas normales, unas pocas fuera de rango, y esas pocas apuntando al mismo sitio.

## Decisión 2: cadena causal del Audi, avería por avería

**P0301 — fallo de encendido en el cilindro 1.** En un diésel es inyector o compresión de ese cilindro. Con un cilindro que no aporta par:
- La **carga calculada** sube, porque la centralita compensa para mantener el ralentí: del 18 % a ~31 %.
- El **régimen** se queda por debajo del objetivo: de 800 rpm a ~770.

**Limitación que hay que asumir y documentar:** un ralentí inestable es *oscilación*, y el emulador responde tramas fijas. No se puede representar el temblor, solo el desplazamiento respecto al valor nominal. Queda anotado en el escenario para que nadie lo lea como que el motor va fino.

**P0401 — flujo de EGR insuficiente.** Con la válvula obstruida o pegada:
- El **error de EGR** pasa de −4,7 % (residual, no justifica nada) a ~−60 %: la centralita pide recirculación y no la obtiene.
- El **caudal de aire** *sube*, de 8,5 a ~11,5 g/s. Es el detalle contraintuitivo y por eso el más valioso: al no entrar gases de escape, entra más aire fresco. Un modelo que explique esto bien está razonando de verdad.

**P2002 — eficiencia del filtro de partículas bajo umbral.** Con el filtro saturado:
- La **temperatura de escape** sube, de 220 a ~310 °C.
- La **carga de hollín** se expone por DID de Mode 22, no por Mode 01.

## Decisión 3: el hollín del filtro va por Mode 22, no por Mode 01

Los PIDs estándar de filtro de partículas viven en el rango extendido de J1979 y exigirían tocar las máscaras de PIDs soportados de todos los bloques. El escenario ya declara DIDs VAG de Mode 22 documentados por la comunidad Ross-Tech/VCDS, que es **exactamente** por donde un equipo real lee la carga de hollín de un VAG.

Más realista y menos invasivo. Y refuerza el argumento del proyecto: los datos que de verdad hacen falta para diagnosticar suelen estar fuera del estándar genérico.

## Decisión 4: una incoherencia que no viene de ninguna avería

El escenario declara **120 segundos de tiempo de marcha** y **90 °C de refrigerante**. Un diésel no llega a 90 °C en dos minutos, con avería o sin ella.

Se corrige subiendo el tiempo de marcha a ~1200 s. Lo importante es el criterio: la coherencia se revisa **entre todos los valores**, no solo contra los DTCs. Este tipo de fallo es el que delata un escenario montado a trozos.

## Decisión 5: el freeze frame se captura bajo carga, no al ralentí

Hoy los valores de Mode 02 son casi los mismos que los de Mode 01, lo que describe una avería detectada con el coche parado en marcha lenta. Un fallo de encendido se registra **con carga**.

El freeze frame pasa a describir el instante del fallo: en torno a 2100 rpm, ~65 km/h, carga alta, refrigerante ya caliente.

**Por qué importa más de lo que parece.** El freeze frame es *la* prueba de por qué no hay que borrar las averías antes de leerlo. Si sus valores son idénticos a los de ahora mismo, no aporta nada y el argumento se cae. Si describen un instante distinto y reconocible, el mecánico ve para qué sirve.

## Decisión 6: los vehículos sanos también tienen que ser creíbles

La Kawasaki declara 4500 rpm con 0 km/h y 105 °C. Es plausible en un banco de pruebas y raro en una lectura de taller: una moto parada está al ralentí, en torno a 1250 rpm. Se ajusta a un ralentí caliente creíble.

**Por qué no da igual.** El vehículo sano es el grupo de control. Si sus valores también son extraños, el contraste con el Audi se pierde y ningún valor significa nada.

## Decisión 7: la coherencia se protege con un test

Se añade un test que, para cada escenario, comprueba que los PIDs asociados a cada DTC declarado caen dentro del rango que corresponde a esa avería.

**Por qué.** Esta divergencia ya ocurrió una vez y nadie se dio cuenta, porque **ningún test exigía coherencia**: los tests comprueban que el parseo es correcto, no que lo parseado tenga sentido. Sin este test, dentro de dos cambios volvemos aquí.

El test vive del lado de la aplicación y consulta al emulador, no reimplementa el escenario. Un test que copie los valores esperados del propio fichero no comprueba nada.

## Decisión 8: el catálogo de escenarios debe coincidir con el emulador

`composition.ts` define `sensorValues` por escenario, y son la fuente de los gauges hasta que la telemetría real esté conectada. Si esos valores no coinciden con lo que responde el emulador, la misma lectura sale distinta en dos sitios de la pantalla.

Se alinean con los valores nuevos. No es duplicación aceptada, es deuda conocida: cuando la telemetría lea del vehículo, `sensorValues` deja de tener sentido y debe desaparecer.

## Riesgos

- **Cambiar valores rompe tests existentes** que los tienen escritos como esperados. Es lo correcto: esos tests estaban fijando datos incoherentes. Hay que actualizarlos entendiendo cada uno, no a ciegas.
- **Sobreactuar.** La tentación es dejar todos los valores llamativos. Si todo está fuera de rango, no hay diagnóstico posible. La mayoría de lecturas deben seguir siendo normales.
- **Las máscaras de PIDs soportados** (`0100`, `0120`, `0140`) deben seguir declarando exactamente los PIDs que el escenario responde. Añadir un PID sin actualizar su máscara produce un vehículo que dice no soportar algo que contesta.
