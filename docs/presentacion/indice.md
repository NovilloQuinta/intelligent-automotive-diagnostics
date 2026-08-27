# Indice de la defensa — cerrado

> 21 slides, ~20:35, en bloques: el problema, que resuelve, como funciona,
> como esta construida, las piezas, el resultado y el cierre. **Se trabaja punto por punto**: el autor cuenta que va en el punto,
> se maqueta, se valida, y solo entonces se pasa al siguiente. Nada de adelantar slides.

| # | Slide | Bloque | Estado |
|---|---|---|---|
| 1 | Portada | | **validada** |
| 2 | Indice | | **nueva** |
| 3 | Diagnostico de averias de vehiculos asistido por IA | 1 Introduccion | pendiente |
| 4 | Flujo de trabajo | 2 Funcionamiento | **validada** |
| 5 | Diagnostico determinista y diagnostico cognitivo | 2 Funcionamiento | pendiente |
| 6 | Tecnologias utilizadas | 3 Diseno | pendiente |
| 7 | Clean Architecture + Hexagonal | 3 Diseno | **rehecha** |
| 8 | Adquisicion de datos mediante OBD-II | 4 Implementacion | pendiente |
| 9 | Persistencia: modelo relacional y modelo vectorial | 4 Implementacion | pendiente |
| 10 | Base de datos relacional | 4 Implementacion | pendiente |
| 11 | Base de datos vectorial e indice de confianza | 4 Implementacion | pendiente |
| 12 | Model Context Protocol: herramientas del agente | 4 Implementacion | pendiente |
| 13 | Ciclo de razonamiento del agente | 4 Implementacion | pendiente |
| 14 | Modelos empleados: lenguaje y embeddings | 4 Implementacion | pendiente |
| 15 | La interfaz del mecanico | 4 Implementacion | **nueva** |
| 16 | Resultados: la aplicacion en funcionamiento | 5 Resultados | pendiente |
| 17 | Calidad del codigo | 6 Calidad y seguridad | **rehecha** |
| 18 | Integracion y despliegue continuos | 6 Calidad y seguridad | **reordenada** |
| 19 | Modelo de seguridad | 6 Calidad y seguridad | **fusionada** |
| 20 | Conclusiones | 7 Conclusiones | pendiente |
| 21 | Gracias por la atencion | | pendiente |

> **Los titulos los revisa el autor.** Se le propuso una tanda y la rechazo.

**Suma: ~20:35.**

## Cambios acordados sobre la primera propuesta

- El punto 7 original (una sola slide para las dos bases de datos) **se parte en dos**:
  la 7 justifica *por que dos motores* y la 8 entra en **que se guarda en la vectorial y por que**.
- Cae la slide de "flujo completo de punta a punta": eso lo cuenta la propia demo.
- La slide de los dos diagnosticos se mueve **detras** del bloque de IA: hablaba de
  "el agente", "herramientas" e "indices vectoriales" antes de haberlos explicado.
- El numero de pagina lo calcula `build.mjs` solo, para que reordenar no lo descuadre.
- **Slide de CI/CD** (2026-08-25): el despliegue automatico no aparecia en ningun sitio.
  La de calidad se queda con TDD, pruebas y seguridad, y el pipeline entero pasa a slide
  propia: integracion -> verificacion -> construccion -> publicacion -> produccion.
- **El OBD-II se queda en el 7** (2026-08-26): se probo a subirlo al 4 y no encaja. Es
  una slide tecnica de como se lee el bus, con la formula de un PID, y cortaba la
  explicacion entre el flujo y los dos diagnosticos. Abre el bloque de piezas, que es
  su sitio: primero de donde salen los datos, luego donde se guardan.
- **Slide de la interfaz** (2026-08-26): el deck era casi todo backend. La UI solo
  aparecia como capturas en la demo y como una fila de tecnologias. Ahora tiene slide
  propia justo antes de la demo: que hace el mecanico y como esta construida.
- **Orden del bloque final corregido** (2026-08-26): calidad y CI/CD son proceso, y
  estaban partidas por las dos de seguridad. Ahora van 15 calidad, 16 CI/CD, 17 OWASP
  de APIs, 18 OWASP de aplicaciones web. La seguridad cierra el cuerpo.
- **El Top 10 web pasa a la edicion 2025** (2026-08-26): la de 2021 es la que tiene
  `docs/security.md`, pero la edicion vigente desde enero de 2026 es la de 2025. Cambian
  el orden y tres nombres, entran `Software Supply Chain Failures` y `Mishandling of
  Exceptional Conditions`, y SSRF se absorbe dentro de `Broken Access Control`.
  **`docs/security.md` sigue en 2021: hay que actualizarlo para que no se contradigan.**
- **Slide de indice** (2026-08-26): se saltaba de una slide a otra sin saber en que
  parte de la charla estabas. Se probo con un rotulo de bloque encima de cada titulo
  y el autor lo rechazo: no se ve en otras presentaciones y mete parafernalia. La
  solucion es la de siempre, una slide de indice con las siete secciones detras de
  la portada.
- **Las dos de OWASP se fusionan en una** (2026-08-26): dos tablas de diez con solape
  real (A01 se parecia a API1 y API5, A02 a API8, A07 a API2). La tabla nueva va por
  la lista de APIs numerada del 01 al 10, con el nombre oficial en ingles y la medida en
  castellano. Se probo con los codigos (`API1 · A01`) y sin nombre de categoria no se
  entienden; se probo tambien con el riesgo en castellano y el autor lo rechazo. Las
  medidas de la interfaz cubren la lista web, y la correspondencia completa esta en
  `docs/security.md`.
- **Las dos slides de seguridad, mismo formato** (2026-08-26): la 17 era de columnas y
  la 16 una tabla. Ahora las dos son la misma tabla: codigo, nombre oficial y medida.
  La 16 es la lista de APIs (backend), la 17 la de aplicaciones web (interfaz). El
  matiz de los riesgos que quedan vive en las notas del ponente, no en la slide.
- **Deck resincronizado con develop** (2026-08-26): entraron 19 commits mientras se
  montaban las slides y cuatro quedaron desfasadas. Cerrados dos de los riesgos que
  enumeraba la 17 (segundo factor TOTP y contadores de rate limit persistidos), la CSP
  la sirve ahora nginx, el despliegue solo corre tras CI en verde y etiqueta por commit,
  y las cifras de pruebas pasan de 2171 a 2403. **Antes de tocar el deck hay que bajarse
  develop**: esta vez lo aviso el autor, no yo.
- **Slide 15 depurada** (2026-08-26): su columna derecha repetia palabra por palabra la
  de integracion continua (lint, formato, Node 22, auditoria de dependencias) y su
  ultimo punto repetia la slide de OWASP. Ahora la derecha habla solo de cobertura:
  por fichero y no de media, minimos reales, y la exclusion escrita de infraestructura.
  Pierde el "y seguridad" del titulo, que ya tiene dos slides propias.
- **Slide de la interfaz** (2026-08-26): la tabla OWASP cubre el backend, pero la SPA
  tambien tiene superficie. Slide propia con las medidas del cliente (escapado de
  React, CSP propia, Zod en formularios, Bearer en vez de cookie) y los cuatro
  riesgos residuales asumidos. Comprobado en codigo, no copiado del documento.
- **Slide de OWASP** (2026-08-26): la de calidad solo decia que las diez categorias
  estaban documentadas. Ahora hay una slide propia con las diez y la medida concreta
  que se aplico en cada una, sacadas de `docs/security.md`. Los nombres van en ingles,
  tal cual los publica OWASP. El ano es 2023 a proposito: el Top 10:2025 es el de
  aplicaciones web, otro proyecto; el de APIs sigue en la edicion de 2023.
- **Slide 6 rehecha** (2026-08-26): justificaba la arquitectura con argumentos de
  manual (testabilidad, desacoplamiento) que valen para cualquier proyecto y no
  decian nada de este. Ahora enumera cinco ventajas concretas ya cobradas, sacadas
  del codigo: de los 23 puertos definidos, tres tienen hoy mas de un adaptador en
  produccion (`ObdRepository`, `Elm327TransportPort`, `LlmClientPort`). Cierra con
  el ejemplo dibujado: un caso de uso, un puerto, dos adaptadores. El punto 5 es la
  testabilidad: las normativas ISO hay que probarlas con test, de ahi 2171 pruebas que
  corren sin coche, sin servidor y sin modelo. En la slide van **solo los cinco
  titulares**; el detalle de cada uno se cuenta en las notas del ponente.
- **Las tres primeras slides se funden en una** (2026-08-25): "que es", "el problema" y
  "que hace" contaban lo mismo por partes y no cerraban la idea. Ahora es una sola que
  explica el conjunto: a la izquierda donde se queda el escaner de hoy, a la derecha lo
  que hace esta herramienta.
- **Titulares y subtitulos en registro formal** (2026-08-25): estaban escritos en tono
  de conversacion ("Lo que te da la maquina", "Se enchufa al coche", "Que guarda").
  Reescritos los 45 textos de titulo, subtitulo y encabezado de columna.
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
