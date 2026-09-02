# Guion de vídeo — Tecnologías utilizadas

> Lo que hay que **decir**, en lenguaje llano. Las frases en cursiva se pueden leer
> tal cual delante de la cámara. El detalle técnico está en `05-arquitectura-core-api.md`
> y `02-embeddings-rag.md`, por si en las preguntas hace falta bajar ahí.

---

## Parte A — Las tecnologías de la API (unos 3 minutos)

### La imagen que lo explica todo

Cuando alguien usa la aplicación, su petición **entra por una puerta y va pasando controles**,
como quien llega a un taller: primero la puerta de la calle, luego el mostrador, luego alguien
comprueba que es cliente, y solo entonces el coche entra al foso.

Cada tecnología es **uno de esos controles**. Eso es todo lo que hay que contar.

> *"El backend está hecho en Node con TypeScript. Cada petición que llega atraviesa una cadena de
> controles antes de que se ejecute nada, y cada una de las tecnologías que voy a nombrar es uno
> de esos controles."*

---

### Express — la estructura del edificio

> *"Express es el armazón: lo que recibe las peticiones que llegan por internet y las reparte a
> la parte del código que sabe responderlas. Es el estándar en Node; aquí uso la versión 5, que
> es la última."*

Y añade la parte que sí es decisión tuya:

> *"Lo importante no es Express en sí, es dónde lo he puesto. Toda la lógica del proyecto —cómo se
> diagnostica un coche, cómo se interpreta un fallo— no sabe que Express existe. Si mañana lo
> cambiara por otro, la lógica del negocio ni se entera."*

**Si preguntan por qué eso importa:** porque la parte valiosa del proyecto no queda atada a una
librería que puede pasar de moda.

---

### Helmet — cerrar puertas y ventanas

> *"Helmet no añade ninguna funcionalidad. Lo que hace es cerrar puertas: le dice al navegador
> cómo debe tratar a esta API para que no se pueda abusar de ella."*

Un ejemplo concreto, que siempre queda bien porque se entiende sin saber nada:

> *"Por ejemplo, le dice al navegador que esta API no carga ni imágenes ni scripts ni nada de
> fuera. Y es verdad: es una API, solo devuelve datos. Así que la regla más estricta que existe
> es, en este caso, simplemente la correcta."*

**Si preguntan:** también obliga a que todo vaya cifrado (HTTPS) y prohíbe que nadie meta la
aplicación dentro de otra página para engañar al usuario.

---

### Zod — el control de calidad de lo que entra

Esta es la que más cuesta explicar, así que ve por el problema primero:

> *"TypeScript me avisa de errores mientras programo, pero desaparece cuando el programa arranca.
> Así que lo que llega de fuera —lo que escribe un usuario, lo que responde la inteligencia
> artificial— nadie lo ha comprobado de verdad."*

> *"Zod es ese control. Antes de que un dato entre al sistema, comprueba que tiene exactamente la
> forma que se espera. Si no la tiene, se rechaza ahí mismo, en la puerta, en vez de reventar
> tres capas más adentro."*

Y el remate, que es el que impresiona:

> *"Se usa hasta para leer la configuración: si el servidor está mal configurado, la aplicación no
> arranca. Falla al encenderla, en vez de fallar a las tres de la mañana con un cliente delante."*

**Si preguntan por la documentación de la API:** la documentación se genera automáticamente a
partir de esas mismas comprobaciones. Es decir, **no puede quedarse desactualizada**, porque no
está escrita a mano: sale del código que está funcionando de verdad.

---

### JWT — la pulsera del festival

La comparación funciona sola:

> *"Cuando alguien inicia sesión, el servidor le da un token. Es como la pulsera de un festival:
> la enseñas en cada puerta y te dejan pasar, sin tener que volver a identificarte."*

> *"Aquí hay dos pulseras. Una de acceso, que caduca a los quince minutos, y otra de renovación,
> que dura una semana y sirve para pedir una nueva sin volver a escribir la contraseña. Cada vez
> que se usa, se anula y se entrega otra: si alguien roba una y la reutiliza, el sistema lo
> detecta y corta la sesión."*

**Prepárate esta pregunta, es la típica:** *"un token no se puede anular, ¿cómo le quitas los
permisos a un administrador?"*

> *"Porque la pulsera no dice si eres administrador. Eso se consulta en la base de datos en cada
> petición. Así, quitarle los permisos a alguien tiene efecto al instante, sin esperar a que su
> token caduque."*

---

### Pino — el libro de registro

> *"Pino es lo que deja constancia de lo que pasa. No guarda frases sueltas: guarda registros
> ordenados, con su hora, su gravedad y su contexto, para poder buscar después qué ocurrió."*

> *"Va a dos sitios: a la consola del servidor y a la base de datos, que es de donde bebe el panel
> de administración de la aplicación."*

**Si preguntan por qué no un `console.log`:** porque un texto suelto no se puede filtrar ni buscar
cuando hay miles de líneas, y porque Pino está pensado para no ralentizar la respuesta.

---

### Cierre del bloque (media frase, no te alargues)

> *"Hay algo más en esa cadena: control de origen de las peticiones, un límite de peticiones por
> minuto para que nadie pueda machacar el servidor, y un registro de auditoría de todo lo que
> entra. Ninguna de estas piezas es exótica. Lo que quería enseñar no es cuál elegí, sino que cada
> una hace una sola cosa y ninguna se mete donde no le toca."*

---

## Parte B — La base de datos vectorial (unos 3 minutos)

### Empieza por el problema, nunca por la tecnología

Esto es lo que hace que se entienda todo lo demás. Cuéntalo despacio:

> *"El diagnóstico OBD tiene una parte estándar, igual en todos los coches. Pero cada fabricante
> añade además los suyos propios: sus sensores y sus códigos de avería. Son miles, no están
> publicados, y no hay forma de tenerlos todos cargados de antemano."*

> *"Así que el sistema tiene que aprenderlos sobre la marcha. Y si aprende, tiene que poder
> recordar después lo que aprendió."*

Y ahora el momento clave, el que justifica toda la tecnología que viene detrás:

> *"El problema es cómo se busca eso. Si un mecánico escribe 'el coche pierde presión de aceite' y
> en el sistema está guardado como 'low oil pressure sensor', una búsqueda normal no encuentra
> nada. No comparten ni una palabra. Y son exactamente lo mismo."*

---

### Qué es una base vectorial (con esta imagen basta)

> *"Una base de datos vectorial no guarda las palabras: guarda el **significado**. Convierte cada
> texto en una posición dentro de un mapa, y los textos que quieren decir lo parecido caen cerca
> unos de otros. Buscar deja de ser comparar letras y pasa a ser mirar qué hay cerca."*

Si quieres una sola frase de cómo se hace:

> *"De eso se encarga un modelo de inteligencia artificial que traduce texto a números. Es
> pequeño, entiende español e inglés —que es justo lo que hace falta aquí, porque la documentación
> técnica está en inglés y el mecánico escribe en español— y corre dentro del propio servidor:
> sin conexión a ningún servicio externo y sin coste por consulta."*

---

### Por qué LanceDB

La frase que lo resuelve:

> *"LanceDB es a las bases vectoriales lo que SQLite a las de toda la vida: no necesita un
> servidor aparte, es una carpeta en el disco y funciona dentro del propio programa."*

Y por qué eso es lo correcto **aquí**:

> *"Esto tiene que poder funcionar en el portátil de un taller, no en un centro de datos. Las
> alternativas que miré exigían levantar un servidor de base de datos aparte, o instalar Python, o
> pagar por cada consulta a un servicio externo. Todas resolvían el problema, pero todas añadían
> una pieza más que mantener. LanceDB no añade ninguna."*

**Si preguntan por qué no una búsqueda de texto normal, que es gratis:** vuelve al ejemplo de
antes. *"Presión de aceite"* contra *"oil pressure"*. Nunca se encontrarían.

---

### Lo que de verdad hay que enseñar: que el sistema aprende

Cuenta el ciclo como una historia, no como un diagrama:

> *"Entra un coche. Durante el diagnóstico aparece un código que el sistema no conoce. Busca en su
> memoria y no encuentra nada. Entonces busca en internet, encuentra una definición posible y la
> guarda… pero **desconfiando de ella**."*

> *"Y aquí viene lo que más me gusta del proyecto: no se lo cree. Lo comprueba. Va al coche real,
> lee ese dato y mira si el valor tiene sentido. Si lo tiene, sube la confianza y lo da por bueno.
> Si no, lo descarta."*

> *"Y no se fía igual de todo el mundo: algo leído en internet entra con poca confianza; algo que
> aporta el mecánico, con bastante más. Como en la vida."*

**El cierre del bloque. Esta es la frase con la que se cierra el vídeo:**

> *"Lo que significa esto es que el sistema no es el mismo después de cada coche. El primer Audi
> que pasa por el taller le enseña sus códigos propios. El segundo Audi ya se los encuentra
> aprendidos y verificados. El conocimiento no lo pone quien programó la aplicación: lo pone la
> flota de coches que va pasando por el taller."*

---

### Una honestidad que suma (guárdala para las preguntas)

Si sale el tema de hasta dónde llega el aprendizaje, esto puntúa más que fingir que está todo
resuelto:

> *"Hay una parte que dejé deliberadamente sin activar: que un dato gane confianza cada vez que se
> reutiliza. Para eso haría falta saber que el diagnóstico **acertó**, y esa información el
> sistema no la tiene. Que un mecánico consulte un caso no significa que le sirviera. Si me la
> inventara, subiría por igual la confianza de los aciertos y la de los errores, y el catálogo
> empeoraría con el uso en vez de mejorar. Hace falta que el mecánico diga si le valió, y eso ya
> es otro alcance."*

Y si preguntan por el riesgo de haber elegido una tecnología poco conocida:

> *"Solo hay un fichero en todo el proyecto que sepa que por debajo hay LanceDB. Cambiar de motor
> sería reescribir ese fichero, nada más."*

---

## Errores a evitar en la grabación

- **No leas la lista de librerías.** Nombre, para qué sirve en una frase, y siguiente.
- **No entres en configuración concreta** (valores, cabeceras, parámetros) salvo que pregunten.
- **En la parte vectorial, resiste la tentación de explicar cómo funciona un embedding por
  dentro.** Con "guarda el significado y lo parecido cae cerca" es suficiente: quien sepa, lo
  reconocerá; quien no, lo entenderá igual.
- **Reserva munición.** Lo que no cuentes en el vídeo es lo que te salva en las preguntas.

---

## Chuleta, por si te preguntan cifras

| | |
|---|---|
| Sesión: token de acceso / de renovación | 15 minutos / 7 días |
| Bloqueo de cuenta | 5 intentos fallidos → 15 minutos |
| Límite de peticiones al login | 5 por minuto |
| Resultados que devuelve una búsqueda | los 5 más parecidos |
| Confianza: internet / mecánico | 0,3 → 0,7 tras verificar / 0,8 → 0,9 |
| Dónde vive todo esto | `infrastructure/http/server.ts` y `infrastructure/persistence/vector/` |
