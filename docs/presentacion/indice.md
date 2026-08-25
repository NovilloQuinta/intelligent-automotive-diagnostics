# Indice de la defensa — cerrado

> 17 slides, ~17 min, en bloques: el problema, que resuelve, como funciona,
> como esta construida, las piezas, el resultado y el cierre. **Se trabaja punto por punto**: el autor cuenta que va en el punto,
> se maqueta, se valida, y solo entonces se pasa al siguiente. Nada de adelantar slides.

| # | Slide | Bloque | Estado |
|---|---|---|---|
| 1 | Portada | | **validada** |
| 2 | Una herramienta de diagnostico de averias de coche | Que es y que resuelve | pendiente |
| 3 | El flujo de trabajo, de principio a fin | Como funciona | **validada** |
| 4 | Dos formas de diagnosticar: por reglas y con IA | Como funciona | pendiente |
| 5 | Tecnologias utilizadas | Como esta construida | pendiente |
| 6 | Arquitectura: Clean Architecture + Hexagonal | Como esta construida | **la reescribe el autor** |
| 7 | Lectura del coche por OBD-II | Las piezas | pendiente |
| 8 | Persistencia: una base relacional y una vectorial | Las piezas | pendiente |
| 9 | La base relacional: que guarda | Las piezas | pendiente |
| 10 | La base vectorial: que guarda y con que confianza | Las piezas | pendiente |
| 11 | MCP: las 16 herramientas del agente | Las piezas | pendiente |
| 12 | El ciclo de razonamiento del agente | Las piezas | pendiente |
| 13 | Los modelos: lenguaje y embeddings | Las piezas | pendiente |
| 14 | Resultados: la aplicacion funcionando | El resultado | pendiente |
| 15 | Calidad: TDD, integracion continua y seguridad | El resultado | pendiente |
| 16 | Conclusiones | Cierre | pendiente |
| 17 | Gracias por la atencion | Cierre | pendiente |

**Suma: ~17 min.**

## Cambios acordados sobre la primera propuesta

- El punto 7 original (una sola slide para las dos bases de datos) **se parte en dos**:
  la 7 justifica *por que dos motores* y la 8 entra en **que se guarda en la vectorial y por que**.
- Cae la slide de "flujo completo de punta a punta": eso lo cuenta la propia demo.
- La slide de los dos diagnosticos se mueve **detras** del bloque de IA: hablaba de
  "el agente", "herramientas" e "indices vectoriales" antes de haberlos explicado.
- El numero de pagina lo calcula `build.mjs` solo, para que reordenar no lo descuadre.
- **Las tres primeras slides se funden en una** (2026-08-25): "que es", "el problema" y
  "que hace" contaban lo mismo por partes y no cerraban la idea. Ahora es una sola que
  explica el conjunto: a la izquierda donde se queda el escaner de hoy, a la derecha lo
  que hace esta herramienta.
- **Titulares reescritos** (2026-08-25): los titulos eran frases de conversacion
  ("Lo que te da la maquina", "Como se sostiene esto") y no decian de que iba la slide.
  Ahora son descriptivos.
- **Slide nueva de arranque**: "Una herramienta de diagnostico de averias de coche".
  Antes hacian falta tres slides para saber que era el proyecto.
- **Reordenado por bloques** (2026-08-25): el deck tenia buenas slides sueltas pero sin
  hilo. Ahora va problema -> que resuelve -> como funciona -> con que -> como esta
  construida -> las piezas -> resultado -> cierre.
- Las **tecnologias suben del puesto 15 al 6**: son parte de "como esta construida", no
  un anexo del final.
- **Los dos diagnosticos** pasan al 5, pegado al flujo: explican el rombo de decision.
- **Descartado** el bloque de caso de estudio / comparativa con herramientas del mercado:
  decision del autor, la defensa se centra en el proyecto.
- Se anaden dos slides a peticion del autor: un **diagrama general del flujo** justo
  despues del objetivo, y una de **tecnologias** antes de la de calidad.
- El bloque de persistencia pasa a **tres** slides: una que presenta las dos bases, una
  para SQLite (el dato seguro) y otra para la vectorial (lo que se descubre).
- Cae la slide de "las tres capas": era solo un ejemplo, asi que **se funde dentro de la 4**
  como bloque de apoyo. Una diapositiva entera de ejemplo no se sostiene.

## Como se trabaja

1. El autor explica el punto con sus palabras.
2. Se maqueta **sin redactar de mas**: titular corto y dos lineas de apoyo como maximo.
   Lo largo va a las notas del ponente, no a la diapositiva.
3. Se revisa el render. Si no suena al autor, se rehace con sus palabras, no con otras mejores.
