# Guion de vídeo — Tecnologías

Para decir en voz alta. Dos minutos en total.

---

## API (unos 50 segundos)

El backend es una API en Node.

Cada vez que llega una petición, pasa por una serie de filtros antes de hacer nada.

**Express** es el armazón: recibe las peticiones y las reparte.

**Helmet** cierra puertas. Le dice al navegador cómo tratar a esta API para que no se pueda
abusar de ella.

**Zod** comprueba que lo que entra tiene la forma que debe tener. Si no la tiene, se rechaza en la
puerta.

**JWT** es la sesión del usuario. Como la pulsera de un festival: la enseñas y pasas. Aquí caduca
a los quince minutos y se renueva sola.

Y **Pino** deja registro de todo lo que pasa. De ahí bebe el panel de administración.

Ninguna es exótica. Cada una hace una cosa, y ninguna se mete donde no le toca.

---

## Base vectorial (poco más de un minuto)

Cada fabricante tiene sus propios sensores y sus propios códigos de avería. Son miles y no están
publicados. Así que el sistema tiene que ir aprendiéndolos.

Y ahí está el problema. Si el mecánico escribe "pierde presión de aceite", y en el sistema está
guardado como *low oil pressure*, una búsqueda normal no encuentra nada. No comparten ni una
palabra. Y son lo mismo.

Por eso uso una base de datos vectorial. No guarda las palabras: guarda el significado. Lo que
quiere decir lo parecido, queda cerca.

He usado LanceDB porque no necesita servidor. Es una carpeta en el disco. Esto tiene que poder
funcionar en el portátil de un taller, no en un centro de datos.

Y lo que más me gusta: cuando aparece un código que no conoce, lo busca… pero no se lo cree. Va al
coche, lee el dato y comprueba que tiene sentido. Si lo tiene, lo da por bueno.

Así que el sistema no es el mismo después de cada coche. El primer Audi que pasa le enseña sus
códigos. El segundo ya se los encuentra aprendidos.

---

## Si preguntan

- **¿Por qué Express y no otro?** Da igual. La lógica del proyecto no sabe que Express existe:
  cambiarlo no tocaría el diagnóstico.
- **¿Un token no se puede anular?** El token no dice si eres administrador. Eso se consulta en la
  base de datos en cada petición, así que quitar permisos tiene efecto al instante.
- **¿Por qué no una búsqueda de texto normal?** El ejemplo del aceite. Nunca se encontrarían.
- **¿Por qué no pgvector, Chroma u OpenAI?** Todas exigían levantar un servicio aparte o pagar por
  consulta. LanceDB no añade nada que mantener.
- **¿El sistema se fía de lo que encuentra en internet?** Poco: entra con baja confianza y solo
  sube si se verifica contra el coche. Lo que aporta un mecánico entra con más.
- **¿Y si LanceDB se queda corto?** Solo hay un fichero que sepa que está ahí debajo.

El detalle largo está en `05-arquitectura-core-api.md` y `02-embeddings-rag.md`.
