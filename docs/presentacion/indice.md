# Indice de la defensa — cerrado

> 18 slides, ~18 min, en cinco bloques: el problema, que resuelve, como funciona,
> como esta construida, las piezas, el resultado y el cierre. **Se trabaja punto por punto**: el autor cuenta que va en el punto,
> se maqueta, se valida, y solo entonces se pasa al siguiente. Nada de adelantar slides.

| # | Slide | Bloque | Estado |
|---|---|---|---|
| 1 | Portada | | **validada** |
| 2 | Lo que te da la maquina | El problema | **validada** |
| 3 | Lo que hace la aplicacion | Que resuelve | **validada** |
| 4 | El flujo de trabajo | Como funciona | **validada** |
| 5 | Dos diagnosticos: determinista y cognitivo | Como funciona | pendiente |
| 6 | Con que esta hecho | Como esta construida | pendiente |
| 7 | Por que esta arquitectura y no otra | Como esta construida | **la reescribe el autor** |
| 8 | Como se lee el coche | Las piezas | **validada** |
| 9 | Dos bases de datos | Las piezas | pendiente |
| 10 | SQLite: el catalogo y los datos del taller | Las piezas | pendiente |
| 11 | Que se guarda en la base vectorial | Las piezas | **validada** |
| 12 | MCP: las herramientas del agente | Las piezas | **validada** |
| 13 | Como razona el agente | Las piezas | **validada** |
| 14 | Los dos modelos | Las piezas | pendiente |
| 15 | La aplicacion funcionando | El resultado | pendiente |
| 16 | Como se sostiene esto | El resultado | pendiente |
| 17 | Conclusiones | Cierre | pendiente |
| 18 | Gracias por la atencion | Cierre | pendiente |

**Suma: ~18 min.**

## Cambios acordados sobre la primera propuesta

- El punto 7 original (una sola slide para las dos bases de datos) **se parte en dos**:
  la 7 justifica *por que dos motores* y la 8 entra en **que se guarda en la vectorial y por que**.
- Cae la slide de "flujo completo de punta a punta": eso lo cuenta la propia demo.
- La slide de los dos diagnosticos se mueve **detras** del bloque de IA: hablaba de
  "el agente", "herramientas" e "indices vectoriales" antes de haberlos explicado.
- El numero de pagina lo calcula `build.mjs` solo, para que reordenar no lo descuadre.
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
