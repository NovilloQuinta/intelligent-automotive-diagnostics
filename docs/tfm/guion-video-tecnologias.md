# Guion de vídeo — Tecnologías utilizadas

Texto corrido para leer. Bloque A: stack de la API. Bloque B: base vectorial.

---

## BLOQUE A — Stack de la API

### Entrada

El backend es una API REST construida sobre Node y TypeScript, con arquitectura por capas.
Las tecnologías que voy a repasar no están elegidas por separado: cada una cubre una
responsabilidad concreta de la cadena por la que pasa toda petición que entra al sistema, y
todas ellas viven confinadas en la capa de infraestructura. Ni el dominio ni los casos de uso
las conocen.

### Express

El framework HTTP es Express, en su versión 5. Es el estándar de facto en Node y el que mejor
encaja con un backend que no necesita nada exótico: enrutado, middleware y poco más.

La versión 5 aporta algo que sí me interesaba: propaga automáticamente al manejador de errores
las excepciones lanzadas dentro de un handler asíncrono. En Express 4 había que envolver cada
handler en un `try/catch` o en una función auxiliar. En un backend donde prácticamente todo es
asíncrono —el puerto serie del adaptador OBD, las llamadas al modelo de lenguaje, la base de
datos— eso elimina código repetido y, sobre todo, elimina la posibilidad de que un error quede
sin manejar.

La decisión de diseño relevante no es Express en sí, sino dónde está: únicamente en
`infrastructure/http`. Los casos de uso no importan Express ni saben que existe una capa HTTP;
se comunican a través de puertos, que son interfaces definidas en la capa de aplicación.
Sustituir el framework afectaría a un directorio, no a la lógica de diagnóstico.

### Zod

Zod es la librería de validación de esquemas. Cubre un hueco que TypeScript no puede cubrir:
el sistema de tipos existe en tiempo de compilación y desaparece en tiempo de ejecución. Todo
lo que entra desde el exterior —el cuerpo de una petición, las variables de entorno, la
respuesta de un modelo de lenguaje— llega sin garantías. Zod pone esa garantía en el límite del
sistema, y del mismo esquema se infiere el tipo de TypeScript, de modo que la forma del dato
está declarada en un único sitio.

Se usa en treinta y seis ficheros, en cuatro frentes. Primero, los DTO de entrada de cada
endpoint. Segundo, la configuración: el fichero de entorno se valida al arrancar, con tipos y
valores por defecto, de forma que una configuración incorrecta impide el arranque en lugar de
provocar un fallo en caliente. Tercero, la capa de integración con el modelo de lenguaje y las
herramientas MCP, donde lo que devuelve el modelo es texto y hay que validarlo antes de tratarlo
como dato. Y cuarto, la documentación: la especificación OpenAPI se genera a partir de esos
mismos esquemas, así que la documentación de la API no puede desincronizarse del código, porque
sale del validador que corre en producción.

Hay además un uso de seguridad concreto. Después de verificar la firma de un token, el payload se
vuelve a validar con un esquema que descarta claves desconocidas. Gracias a eso, el token de reto
del segundo factor no puede pasar por un token de acceso.

### JWT

La autenticación se apoya en JSON Web Tokens, con un esquema de doble token. El token de acceso
vive quince minutos y viaja en la cabecera `Authorization`. El token de refresco vive siete días,
se almacena hasheado en base de datos y se rota en cada uso: al renovar, el token anterior queda
revocado. Si llega un token de refresco ya revocado, el sistema lo interpreta como un indicio de
reutilización —un token comprometido— y corta la sesión.

La objeción habitual a JWT es que no se puede revocar antes de que expire. Aquí se resuelve
sacando la autorización del token: el token de acceso identifica al usuario, pero no contiene su
rol. El middleware de administración consulta el usuario en base de datos en cada petición, de
modo que retirar el rol de administrador surte efecto de inmediato. Es un compromiso deliberado:
se conserva el carácter sin estado para la parte barata y se paga una consulta solo donde hace
falta revocación inmediata.

Alrededor de esto hay bloqueo de cuenta tras cinco intentos fallidos, con un contador atómico
resuelto en una sola sentencia SQL para evitar condiciones de carrera, y un segundo factor TOTP
cuyo secreto se almacena cifrado.

### Helmet

Helmet gestiona las cabeceras de seguridad de la respuesta. No añade funcionalidad: reduce
superficie de ataque estableciendo las cabeceras que el navegador aplica.

La configuración es deliberadamente restrictiva. La política de seguridad de contenido es
`default-src 'none'`, la más estricta posible, y aquí es además la literalmente correcta: se
trata de una API REST que devuelve datos, no carga scripts, ni estilos, ni imágenes. Se fuerza
HTTPS mediante HSTS con un año de vigencia e inclusión de subdominios, se deniega el
enmarcado de la aplicación para prevenir clickjacking, y se desactiva la inferencia de tipo de
contenido por parte del navegador.

Hay una excepción documentada: Swagger UI sí necesita cargar scripts y estilos. En lugar de
relajar la política global, la ruta de documentación monta su propia instancia de Helmet con una
política específica, y además solo se publica fuera de producción.

### Pino

El registro de eventos se hace con Pino, un logger estructurado. La diferencia frente a escribir
texto plano es que cada entrada es un objeto con nivel, mensaje y contexto, lo que permite
filtrar y agregar. Se eligió Pino además por rendimiento: está diseñado para que registrar no
penalice el tiempo de respuesta.

En el proyecto está implementado detrás de un puerto, `LoggerPort`, así que los casos de uso
dependen de la interfaz y no de la librería. Escribe en dos destinos: la salida estándar
—formateada de forma legible en desarrollo y en JSON en producción, para que la ingiera un
agregador— y una tabla de la base de datos, que es la fuente del panel de administración.

### Cierre del bloque

Completan la cadena tres piezas más: control de origen mediante CORS con lista blanca,
limitación de tasa por ruta con el contador persistido en base de datos —de modo que reiniciar
el proceso no reinicia la cuota— y un registro de auditoría de cada petición, que cubre el
control A09 del OWASP API Top 10.

Ninguna de estas elecciones es llamativa por sí sola. El criterio ha sido el mismo en todas:
una responsabilidad por pieza, configuración explícita en lugar de valores por defecto, y
ninguna de ellas filtrándose fuera de la capa de infraestructura.

---

## BLOQUE B — Base de conocimiento vectorial

### El problema

El diagnóstico OBD-II tiene una parte normalizada, común a todos los vehículos. Pero cada
fabricante define además sus propios parámetros propietarios, en el Mode 22, y sus propios
códigos de avería específicos. Son miles, no están publicados de forma centralizada y no hay
manera razonable de precargarlos.

La consecuencia de diseño es que el catálogo no puede ser estático: el sistema tiene que poder
incorporar definiciones nuevas durante un diagnóstico y recuperarlas después. Y recuperarlas es
justamente donde una base de datos relacional se queda corta. Si un mecánico describe un síntoma
como "pérdida de presión de aceite" y en el catálogo la entrada está registrada como *low oil
pressure sensor*, una búsqueda por texto no devuelve nada: no hay una sola palabra en común. Y
son la misma cosa.

### Por qué búsqueda semántica

Lo que hace falta es buscar por significado y no por coincidencia literal, y eso es lo que
resuelve una base de datos vectorial. Cada texto se convierte en un vector, una representación
numérica de su significado, y textos semánticamente próximos quedan próximos también en ese
espacio. La búsqueda deja de ser una comparación de cadenas y pasa a ser un cálculo de
distancias.

Los vectores los genera un modelo de embeddings que corre en local, dentro del propio proceso
Node: `paraphrase-multilingual-MiniLM-L12-v2`, de trescientas ochenta y cuatro dimensiones.
Es multilingüe, que era un requisito y no una comodidad, porque la documentación técnica de
automoción está en inglés y el mecánico escribe en español. Al ser local no requiere clave de
API, no introduce latencia de red y no tiene coste por consulta. El precio que se paga son unos
trescientos megas de memoria en el proceso.

### Por qué LanceDB

Como motor vectorial he elegido LanceDB. El criterio ha sido no añadir infraestructura: LanceDB
es una base de datos embebida, sin servidor, que persiste en un directorio del disco y corre
dentro del propio proceso. Es el mismo paradigma que ya usa el proyecto para los datos
relacionales con SQLite, y tiene soporte nativo en Node.

Las alternativas que evalué se descartaron una por una con ese mismo criterio. **pgvector** exige
un PostgreSQL en marcha: habría supuesto introducir un servidor de base de datos completo solo
para esta funcionalidad. **Chroma** requiere un runtime de Python y un servicio aparte, lo que
rompe el planteamiento de despliegue autocontenido. Los **embeddings de OpenAI** implican clave de
API, coste por consulta y latencia de red para una búsqueda que es interna al sistema. Y la
**búsqueda de texto completo de SQLite**, que era la opción sin coste, no captura similitud
semántica, que es precisamente el problema a resolver.

### Cómo funciona la búsqueda

El catálogo se organiza en cuatro colecciones: parámetros propietarios, códigos de avería,
diagnósticos completos y definiciones de centralita. Cada registro es un vector más sus
metadatos: fabricante, modelo, confianza y origen del dato.

Una consulta se convierte primero en su vector y después se piden los cinco registros más
cercanos, con la posibilidad de filtrar por fabricante y modelo mediante un predicado sobre los
metadatos. La métrica es distancia euclídea; como los vectores salen normalizados, es equivalente
a similitud coseno. El umbral que el sistema considera de alta relevancia es una distancia
inferior a cero coma cinco.

Un apunte que conviene explicitar: no se ha configurado un índice aproximado. La búsqueda es
exacta. Con un corpus del orden de cientos de entradas, un índice aproximado añadiría complejidad
y pérdida de precisión sin ganancia real de tiempo. Es una decisión tomada con el volumen
delante, no una omisión.

### El ciclo de aprendizaje

Este es el comportamiento que da sentido a todo lo anterior. Durante un diagnóstico aparece un
parámetro o un código que el sistema no reconoce. Consulta el catálogo y no encuentra
coincidencias relevantes. Entonces recurre a búsqueda web y obtiene una definición candidata,
que indexa con una confianza baja, de cero coma tres.

Y aquí está el punto importante: esa definición no se da por buena. Se valida contra el vehículo.
El sistema lee ese parámetro por OBD, aplica la fórmula de decodificación y comprueba que el
valor cae dentro del rango esperado. Si valida, la confianza sube a cero coma siete. Si no,
se descarta.

El sistema de confianza distingue el origen del dato: una definición obtenida de la web entra con
cero coma tres, mientras que una aportada por el mecánico entra con cero coma ocho, y sube a cero
coma nueve tras validarse. La finalidad es evitar que el catálogo se contamine con información no
verificada.

Al cerrar un diagnóstico, el caso completo —síntomas, parámetros implicados y conclusión— se
indexa también. Eso construye una memoria de casos que se consulta en diagnósticos posteriores.

### El resultado

La consecuencia es que el sistema no es el mismo después de cada vehículo. El primer Audi que se
diagnostica aporta sus parámetros propietarios, validados contra el propio coche. El segundo
Audi ya los encuentra en el catálogo. El conocimiento no lo aporta quien desarrolló la
aplicación: lo aporta la flota que pasa por el taller.

### Dos precisiones que quiero dejar dichas

La primera es una limitación asumida. Existe un mecanismo para que una entrada gane confianza
cada vez que se reutiliza con éxito, está implementado y está deliberadamente sin conectar. Para
activarlo haría falta saber que el diagnóstico fue acertado, y esa señal el sistema no la tiene:
que un mecánico consulte un caso anterior no implica que le resultara útil. Darla por buena
elevaría por igual la confianza de los aciertos y la de los errores, degradando el catálogo con
el uso. Obtenerla requiere realimentación explícita del mecánico, y eso es un cambio de alcance.

La segunda es sobre el riesgo de haber elegido un motor relativamente joven. Toda la cadena de
búsqueda semántica pasa por un único módulo acoplado a LanceDB, que es el que aprovisiona las
tablas, traduce los filtros y valida dimensiones. Migrar a otro motor consistiría en reescribir
ese módulo. Y si la capa vectorial fallara, el diagnóstico OBD-II básico sigue operativo: el
conocimiento aprendido enriquece el diagnóstico, no lo sostiene.
