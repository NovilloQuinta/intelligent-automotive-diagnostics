## Contexto

Tres modos estándar que faltan. El parser de DTCs y el catálogo de descripciones ya existen; la mayor parte del trabajo es exponerlos bien y no duplicar nada.

## Decisión 1: borrar es la única escritura permitida sobre el vehículo

La norma del proyecto sobre un coche real es **solo lectura**: nada de escribir en centralitas, activar actuadores ni lanzar rutinas. El Mode 04 es la excepción de este cambio, y lo es porque es una operación estándar, acotada y que el mecánico dispara conscientemente.

No abre la puerta a nada más. Cualquier otra escritura sigue prohibida.

## Decisión 2: el diálogo de confirmación explica consecuencias, no pide confirmación genérica

Un "¿estás seguro?" no informa. El diálogo debe decir qué se pierde:

- Se borran las averías almacenadas **y su freeze frame**. Esa foto es la evidencia de en qué condiciones falló el motor; una vez borrada, no se recupera.
- Las **averías permanentes (Mode 0A) no se borran**. Solo desaparecen cuando la centralita verifica por sí misma que el fallo ya no ocurre.

**Por qué importa.** Borrar antes de haber leído el freeze frame es el error clásico de quien empieza. Si nuestra herramienta lo advierte, enseña a usarla bien — y eso es exactamente el valor que la app dice aportar a alguien que repara en casa.

## Decisión 3: el parser de DTCs no se duplica

Los modos 03, 07 y 0A devuelven la misma estructura de bytes con distinta cabecera de respuesta. Se reutiliza `parseDtcResponse` + `DtcCode.decodeFromBytes` parametrizando el modo.

Tres copias del mismo parser divergirían y darían códigos distintos para la misma trama según en qué lista aparezca. Si al implementar aparece la tentación de copiar y pegar, hay que parar y extraer.

## Decisión 4: las tres listas se muestran siempre, aunque estén vacías

Ocultar una sección vacía parece limpio y es un error de diagnóstico: "no hay averías pendientes" es un dato que el mecánico necesita ver afirmado. Si la sección desaparece, no puede distinguir entre "no hay" y "no se ha consultado".

## Decisión 5: el estado del testigo se lee, no se deduce

El número de averías almacenadas se podría contar del Mode 03, y el testigo se podría inferir de si hay averías. **No se hace.** Se lee el Mode 01 PID 01, que es la fuente oficial.

**Por qué.** No siempre coinciden. Una avería recién confirmada puede estar en la lista con el testigo aún apagado, y hay averías que nunca lo encienden. Deducirlo daría una respuesta que parece correcta y no lo es.

Se descarta interpretar los bytes B, C y D (monitores de emisiones) — fuera de alcance por decisión explícita. Se leen los 4 bytes y se usan solo el A; dejar anotado en el código qué contienen los otros tres, por si se retoma.

## Decisión 6: el emulador no cambia de estado al borrar

Un emulador ELM327 responde con tramas fijas. Al recibir `04` devolverá confirmación positiva, pero **seguirá listando las mismas averías** en la siguiente lectura.

Es el comportamiento esperado y hay que anotarlo, en el código y en el reporte final, para que nadie lo interprete como un fallo del borrado. Contra un vehículo real las averías sí desaparecen.

## Riesgos

- **Mode 0A no está soportado por todos los vehículos.** Es obligatorio en modelos relativamente recientes; en uno antiguo la respuesta será `NO DATA`. Debe tratarse como "no soportado" y mostrarse así, nunca como lista vacía ni como error.
- **Los monitores quedan sin leer.** Si más adelante se retoma la parte de inspección técnica, hay que recordar que se distinguen según el motor sea de gasolina o diésel: el byte B lo indica y los monitores no son los mismos.
