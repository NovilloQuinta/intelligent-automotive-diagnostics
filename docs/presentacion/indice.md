# Indice de la defensa — cerrado

> 16 slides, ~17 min. **Se pasa del tiempo: hay que recortar.** **Se trabaja punto por punto**: el autor cuenta que va en el punto,
> se maqueta, se valida, y solo entonces se pasa al siguiente. Nada de adelantar slides.

| # | Slide | Min | Estado |
|---|---|---|---|
| 1 | Portada | 0:15 | **validada** |
| 2 | El problema | 0:45 | **validada** |
| 3 | El objetivo | 0:55 | **validada** |
| 4 | Por que esta arquitectura y no otra (incluye el ejemplo de las tres capas) | 1:20 | **la reescribe el autor** |
| 5 | OBD-II: como se lee el coche de verdad | 1:10 | **validada** |
| 6 | Dos bases de datos: vista general | 0:55 | pendiente |
| 7 | SQLite: el catalogo y los datos del taller | 1:00 | pendiente |
| 8 | Que se guarda en la base vectorial y por que | 1:10 | **validada** |
| 9 | MCP: las herramientas del agente | 1:15 | **validada** |
| 10 | Como razona el agente: el ciclo y el system prompt | 1:20 | **validada** |
| 11 | Los dos modelos: lenguaje y embeddings | 1:05 | pendiente |
| 12 | Los dos diagnosticos: determinista y cognitivo | 1:05 | pendiente |
| 13 | Demo | 2:00 | pendiente |
| 14 | Calidad: TDD, tests, CI, seguridad | 0:55 | pendiente |
| 15 | Conclusiones | 0:45 | pendiente |
| B | Backup para preguntas del tribunal | — | pendiente |

## Cambios acordados sobre la primera propuesta

- El punto 7 original (una sola slide para las dos bases de datos) **se parte en dos**:
  la 7 justifica *por que dos motores* y la 8 entra en **que se guarda en la vectorial y por que**.
- Cae la slide de "flujo completo de punta a punta": eso lo cuenta la propia demo.
- La slide de los dos diagnosticos se mueve **detras** del bloque de IA: hablaba de
  "el agente", "herramientas" e "indices vectoriales" antes de haberlos explicado.
- El numero de pagina lo calcula `build.mjs` solo, para que reordenar no lo descuadre.
- El bloque de persistencia pasa a **tres** slides: una que presenta las dos bases, una
  para SQLite (el dato seguro) y otra para la vectorial (lo que se descubre).
- Cae la slide de "las tres capas": era solo un ejemplo, asi que **se funde dentro de la 4**
  como bloque de apoyo. Una diapositiva entera de ejemplo no se sostiene.

## Como se trabaja

1. El autor explica el punto con sus palabras.
2. Se maqueta **sin redactar de mas**: titular corto y dos lineas de apoyo como maximo.
   Lo largo va a las notas del ponente, no a la diapositiva.
3. Se revisa el render. Si no suena al autor, se rehace con sus palabras, no con otras mejores.
