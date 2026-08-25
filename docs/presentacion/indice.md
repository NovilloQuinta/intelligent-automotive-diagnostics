# Indice de la defensa — cerrado

> 18 slides, ~18 min. **Hay que recortar unos 3 min.** **Se trabaja punto por punto**: el autor cuenta que va en el punto,
> se maqueta, se valida, y solo entonces se pasa al siguiente. Nada de adelantar slides.

| # | Slide | Min | Estado |
|---|---|---|---|
| 1 | Portada | 0:15 | **validada** |
| 2 | Lo que te da la maquina (el problema) | 0:45 | **validada** |
| 3 | Lo que hace la aplicacion (el objetivo) | 0:55 | **validada** |
| 4 | El sistema de un vistazo (diagrama general) | 1:00 | pendiente |
| 5 | Por que esta arquitectura y no otra | 1:20 | **la reescribe el autor** |
| 6 | Como se lee el coche (OBD-II) | 1:10 | **validada** |
| 7 | Dos bases de datos | 0:55 | pendiente |
| 8 | SQLite: el catalogo y los datos del taller | 1:00 | pendiente |
| 9 | Que se guarda en la base vectorial | 1:10 | **validada** |
| 10 | MCP: las herramientas del agente | 1:15 | **validada** |
| 11 | Como razona el agente | 1:20 | **validada** |
| 12 | Los dos modelos: lenguaje y embeddings | 1:05 | pendiente |
| 13 | Los dos diagnosticos: determinista y cognitivo | 1:05 | pendiente |
| 14 | La aplicacion funcionando (capturas reales) | 2:00 | pendiente |
| 15 | Con que esta hecho (tecnologias) | 0:55 | pendiente |
| 16 | Como se sostiene esto: TDD, CI y seguridad | 1:00 | pendiente |
| 17 | Conclusiones | 0:45 | pendiente |
| 18 | Gracias por la atencion | 0:10 | pendiente |

**Suma: ~18 min.** Se pasa de los 15. Candidatas a caer, por orden:
la 13 (los dos diagnosticos, que a esas alturas ya se ha contado casi todo),
la 8 (SQLite, que se puede resumir en la 7) y la 15 (tecnologias, que puede ir a backup).

## Cambios acordados sobre la primera propuesta

- El punto 7 original (una sola slide para las dos bases de datos) **se parte en dos**:
  la 7 justifica *por que dos motores* y la 8 entra en **que se guarda en la vectorial y por que**.
- Cae la slide de "flujo completo de punta a punta": eso lo cuenta la propia demo.
- La slide de los dos diagnosticos se mueve **detras** del bloque de IA: hablaba de
  "el agente", "herramientas" e "indices vectoriales" antes de haberlos explicado.
- El numero de pagina lo calcula `build.mjs` solo, para que reordenar no lo descuadre.
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
