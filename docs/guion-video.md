# Guion del vídeo de entrega del TFM

> El requisito: *"Vídeo con tu propia explicación del proyecto y captura de pantalla"*.
> Es **obligatorio** grabar la pantalla mientras explicas; la cámara con tu cara es opcional.
>
> Esto **no** es la defensa ante el tribunal (ese guion son las notas del deck,
> ~20:35). Aquí el corrector quiere entender el proyecto y verlo funcionar.
> **Objetivo: 11–12 minutos.** Dos tercios de ese tiempo son la aplicación en marcha.
>
> La demo pantalla a pantalla, con la configuración previa y lo que hay que evitar en
> cámara, está en [`guion-demo.md`](guion-demo.md). Este documento la envuelve y le pone
> principio y final.

## Antes de grabar

Además de la preparación de `guion-demo.md` (los tres emuladores levantados, una pasada en
seco para dejar la base sembrada, `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` puestas):

| Comprobación | Por qué |
|---|---|
| **Nada de `.env` en pantalla, nunca** | Lleva claves reales. Si tienes que enseñar configuración, enseña `.env.example` |
| Cerrar pestañas, marcadores, notificaciones y Slack/correo | Sale todo en la grabación |
| Navegador al 100 % o 110 %, ventana maximizada, 1080p mínimo | Que el texto se lea al reproducir |
| Editor con una fuente grande si vas a enseñar código | 14 pt en el editor no se lee en un vídeo |
| Una toma de prueba de 30 s y escúchala | El audio malo hunde un vídeo bueno más que un plano feo |
| Ten el deck abierto en una pestaña | Los bloques 1 y 2 se cuentan encima de sus slides |

Graba con OBS o QuickTime. Si te trabas, **no cortes**: para, respira y repite la frase —
se recorta después. Una toma en la que te equivocas y sigues es mejor que ocho intentos.

---

## Bloque 0 — Presentación (0:00 – 0:45)

Pantalla: la portada del deck, o la landing de la aplicación.

> "Hola, soy Jesús Ángel Novillo y este es mi Trabajo Fin de Máster: **Intelligent
> Automotive Diagnostics**, una herramienta de diagnóstico de averías de coche que se
> conecta al vehículo por el puerto OBD-II, lee sus datos reales y razona sobre ellos con
> un modelo de lenguaje.
>
> En estos minutos os cuento qué problema resuelve, cómo está construido, y sobre todo os
> lo enseño funcionando, que es lo que importa."

## Bloque 1 — El problema (0:45 – 2:00)

Pantalla: la slide 3 del deck (el antes y el después).

> "Hoy, cuando conectas una máquina de diagnosis a un coche, te salen códigos: P0301, fallo
> de encendido en el cilindro uno; P0401, EGR obstruida; P2002, filtro de partículas. Diez
> códigos y ninguna prioridad. El mecánico tiene que decidir por dónde empezar, y esa
> decisión depende de su experiencia con ese motor concreto.
>
> Lo que hace esta herramienta es dar el paso siguiente: coge esos códigos, **más** la
> telemetría en vivo, **más** los datos congelados del instante del fallo, y con todo eso
> el agente razona y devuelve una hipótesis ordenada — qué mirar primero y por qué.
>
> Y hay una segunda idea, que para mí es la importante: el sistema **aprende**. Cada
> fabricante se inventa sensores y códigos fuera de la norma. Cuando el agente se topa con
> uno que no conoce, lo investiga, lo guarda, y el siguiente diagnóstico ya parte de ahí.
> El catálogo crece con el uso."

## Bloque 2 — Cómo está construido (2:00 – 4:00)

Pantalla: slides 6 (tecnologías) y 7 (arquitectura). No te enredes: dos minutos.

> "Todo es TypeScript en modo estricto sobre Node 22, backend y frontend. La API es
> Express 5 con Zod validando todo lo que entra, JWT para autenticar y pino para el log.
> La interfaz es React 19 con Vite y TanStack.
>
> Y hay **dos** bases de datos, porque guardan cosas distintas. SQLite, con Drizzle, para
> todo lo que se pide por una clave exacta: usuarios, vehículos, sesiones, informes.
> Y LanceDB, que es vectorial, para lo que hay que buscar por parecido: los sensores y
> códigos propietarios que el sistema ha ido aprendiendo, y los casos ya resueltos.
> Los *embeddings* se calculan en local, no salen del servidor.
>
> La arquitectura es **Clean Architecture con patrón hexagonal**: dominio, aplicación e
> infraestructura, con las dependencias apuntando siempre hacia dentro. La elegí por una
> razón concreta: aquí el dominio no me lo he inventado yo, son **normas** — SAE J1979,
> ISO 15031, ISO 3779. Eso hay que poder probarlo con tests sin levantar nada, y por eso
> el dominio no conoce ni la base de datos ni el coche.
>
> Y la pieza que une la IA con el resto es el **MCP, el Model Context Protocol**. El modelo
> no toca el coche: pide herramientas. He construido dieciséis — siete de diagnóstico
> sobre el bus OBD, ocho de consulta y escritura sobre la base de conocimiento, y una de
> búsqueda web. El sistema decide si las ejecuta y con qué argumentos, y deja traza de
> todas."

## Bloque 3 — La aplicación funcionando (4:00 – 10:00) · **el grueso**

Aquí cambias a la aplicación y ya no vuelves al deck. Sigue
[`guion-demo.md`](guion-demo.md) § 2, que tiene las frases pantalla a pantalla. El orden
comprimido para el vídeo, con los tiempos:

| Min | Pantalla | Qué subrayar |
|---|---|---|
| 4:00 | Login y selección de vehículo | Rápido. Solo para entrar |
| 4:30 | **Identificación por VIN** | Modo 09, se decodifica el WMI. *"Nada de esto está cableado en el código"* |
| 5:15 | **Datos en vivo** | Telemetría a 1 Hz y la lista de PIDs que **este** coche declara soportar |
| 6:00 | **Códigos DTC** | Las tres pestañas son los servicios 03, 07 y 0A de la norma. **No pulses "Borrar averías"** |
| 6:45 | **Freeze frame** | Modo 02: distingue el fallo en frío del fallo en caliente |
| 7:15 | **Unidades de control** | Barrido del bus. Adelántate: solo el motor está estandarizado en 7E8 |
| 7:45 | **Diagnóstico cognitivo** ← el núcleo | Lanza una consulta concreta y **enseña la traza de tools** |
| 9:00 | **Panel de conocimiento** (`/admin/knowledge`) | Busca lo que el agente acaba de indexar. *"Es el mismo dato, escrito hace diez segundos"* |
| 9:30 | Informe e historial | El informe queda congelado y se recupera |

Las dos frases que **no** te puedes dejar, porque son la tesis del proyecto:

> Sobre la traza de tools:
> "El modelo decide por su cuenta qué preguntar y en qué orden. Esto de aquí es la traza
> completa: cada herramienta que ha llamado y qué le ha respondido. Es lo que hace el
> diagnóstico auditable en vez de una caja negra — se puede reconstruir por qué dijo lo
> que dijo."

> Sobre el catálogo, si el agente indexa algo (y si no lo hace, enséñalo ya indexado en el
> panel):
> "Esto no estaba en ningún sitio. El agente ha encontrado un sensor que no reconocía, ha
> buscado si alguien lo había aprendido antes, y como no existía lo ha guardado él mismo,
> con la fórmula de conversión que ha inferido. La próxima vez ya lo sabe."

Si tienes grabación del **coche real** por cable USB, mete quince segundos aquí. Es lo que
separa este proyecto de una simulación y no hace falta explicarlo mucho: se ve.

## Bloque 4 — Que esto se sostiene (10:00 – 11:00)

Puedes enseñar la pestaña de Actions de GitHub, o la slide 17-18.

> "Esto lo he hecho yo solo, así que lo que avisa de las roturas no es un compañero: son
> las comprobaciones automáticas. El código se escribe con TDD, primero el test que falla.
> Hay más de dos mil cuatrocientas pruebas en verde entre backend y frontend, y el
> *coverage* entra en el gate: el núcleo del dominio al cien por cien.
>
> Cada push pasa por integración continua — lint, formato, tests, compilación, typecheck,
> auditoría de dependencias y pruebas de extremo a extremo con Playwright contra los
> emuladores. Y solo si eso acaba en verde sobre `main` se dispara el despliegue: construye
> las imágenes, las publica etiquetadas con el SHA, entra por SSH al servidor y verifica
> que la aplicación responde antes de darse por bueno. Volver atrás es cambiar una
> variable.
>
> En seguridad he trabajado las dos listas de OWASP que aplican, la de APIs y la de
> aplicaciones web: JWT con refresh, segundo factor TOTP, bloqueo por intentos fallidos,
> *rate limiting*, cabeceras con Helmet y una política de contenido servida por nginx.
> Está documentado en `docs/security.md`."

## Bloque 5 — Cierre (11:00 – 11:30)

Pantalla: la aplicación desplegada, `diag.jcodinglabs.com`.

> "El proyecto está desplegado y se puede usar en **diag.jcodinglabs.com**; en el README
> están las credenciales de prueba. El código, la documentación y las slides están en el
> repositorio de GitHub, con el enlace en el formulario de entrega.
>
> Y lo que me llevo de haberlo hecho: que con IA se pueden construir cosas complejas mucho
> más rápido de lo que era posible antes, pero que la arquitectura y las pruebas no sobran
> — son justo lo que te deja ir rápido sin romper nada.
>
> Gracias por verlo."

---

## Lo que hay que resistirse a hacer

| Tentación | Por qué no |
|---|---|
| Enseñar código fuente durante minutos | El corrector ya tiene el repositorio. El vídeo es para ver **el producto funcionando** |
| Contar la historia de cada decisión técnica | Eso es la defensa, no esto. Aquí van los titulares |
| Empezar por la arquitectura | Se pierde quien no conoce el proyecto. Primero qué problema resuelve |
| Parar y arrancar contenedores en cámara | El transporte tarda hasta 30 s en recuperarse: te quedas mirando una pantalla en blanco |
| Grabar de un tirón sin ensayar el bloque 3 | Es el que tiene esperas reales (el agente tarda). Ensaya para saber cuándo callarte y cuándo llenar |

## Después de grabar

1. Cortar los tropiezos y las esperas muertas del diagnóstico cognitivo (o acelerarlas ×2
   con un rótulo, que es más honesto que cortar).
2. Subir a YouTube **como "no listado"** o a Drive con enlace público. Comprobar el enlace
   en una ventana de incógnito: si pide permiso, el corrector no puede verlo.
3. Pegar la URL en el README (§ Entrega del TFM) y en el formulario.
